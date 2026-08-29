import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { get_active_prompt, get_prompt, PromptOut, PromptDetailOut } from "../../api";
import { swr } from "../../cache";
import ArtImage from "../Utils/ArtImage";
import SubmissionLightbox from "../Utils/SubmissionLightbox";

// Columns grow ~square with the submission count: ceil(sqrt(n)), clamped 1..4.
const columnsFor = (n: number) => Math.min(4, Math.max(1, Math.ceil(Math.sqrt(Math.max(1, n)))));

// The week's prompt as a small gallery: one bordered box holding the title
// and the submissions. No actions here — adding art and proposing prompts
// live on the prompt page (/prompts/:id/grid). Clicking a piece zooms it,
// with ← → through the rest.
export default function PromptColumn() {
  const { token } = useAuth()!;
  const [active, setActive] = useState<PromptOut | null | undefined>(undefined);
  const [prompt, setPrompt] = useState<PromptDetailOut | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    swr("prompt:active", () => get_active_prompt(token), (p) => { if (!cancelled) setActive(p); })
      .catch(() => { if (!cancelled) setActive(null); });
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    swr(`prompt:${active.id}`, () => get_prompt(active.id, token), (p) => { if (!cancelled) setPrompt(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, [active, token]);

  const submissions = prompt?.submissions ?? [];
  const cols = columnsFor(submissions.length);

  return (
    <div className="hp-box">
      <div className="hp-header">
        <span className="hp-kicker">this week's prompt</span>
        {active === undefined ? null : active === null ? (
          <span className="hp-title">no prompt this week</span>
        ) : (
          <>
            <span className="hp-title">{active.title}{active.media_name ? ` (${active.media_name})` : ""}</span>
            {active.short_summary && <span className="hp-summary">{active.short_summary}</span>}
          </>
        )}
      </div>
      <div className="hp-grid-area">
        {active === undefined ? (
          <div className="hp-empty">loading…</div>
        ) : active === null ? (
          <div className="hp-empty">check back soon</div>
        ) : submissions.length === 0 ? (
          <div className="hp-empty">no submissions yet</div>
        ) : (
          <div className="hp-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {submissions.map((s, i) => (
              <button key={s.id} className="hp-cell" onClick={() => setZoom(i)}>
                <ArtImage artId={s.id} fullSrc={s.file_path} alt={s.title} className="hp-cell-img" />
              </button>
            ))}
          </div>
        )}
      </div>
      {zoom !== null && (
        <SubmissionLightbox pieces={submissions} index={zoom} onIndex={setZoom} onClose={() => setZoom(null)} />
      )}
    </div>
  );
}
