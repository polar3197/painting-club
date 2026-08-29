import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { get_active_prompt, get_prompt, PromptOut, PromptDetailOut } from "../../api";
import { swr } from "../../cache";
import ArtImage from "../Utils/ArtImage";

// The week's prompt as a row: one bordered box with the title on top and the
// submissions as a strip of images scrolled sideways. Clicking anything
// opens the full prompt page (/prompts/:id/grid), where pieces zoom and art
// is added.
export default function PromptColumn() {
  const navigate = useNavigate();
  const { token } = useAuth()!;
  const [active, setActive] = useState<PromptOut | null | undefined>(undefined);
  const [prompt, setPrompt] = useState<PromptDetailOut | null>(null);
  const open = () => active && navigate(`/prompts/${active.id}/grid`);

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

  return (
    <div className={`hp-box ${active ? "hp-box-link" : ""}`} onClick={open} role={active ? "link" : undefined} tabIndex={active ? 0 : -1}
      onKeyDown={(e) => { if (e.key === "Enter") open(); }}>
      <div className="hp-header">
        <span className="hp-kicker">weekly prompt</span>
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
          <div className="hp-strip">
            {submissions.map((s) => (
              <span key={s.id} className="hp-cell">
                <ArtImage artId={s.id} fullSrc={s.file_path} alt={s.title} className="hp-cell-img" />
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
