import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  get_active_prompt, get_prompt, list_prompts, add_new_visual_2d, get_media, create_prompt_suggestion,
  PromptOut, PromptDetailOut, PromptSummary, MediaType, Visual2DIn,
} from "../../api";
import { swr } from "../../cache";
import ArtImage from "../Utils/ArtImage";
import AddArtDialog from "../Utils/AddArtDialog";
import "../../styles/utils/dialog.css";

// Columns grow ~square with the submission count: ceil(sqrt(n)), clamped 1..4.
const columnsFor = (n: number) => Math.min(4, Math.max(1, Math.ceil(Math.sqrt(Math.max(1, n)))));

// The week's prompt as a narrow scrolling column — the iOS prompt page,
// minus the chrome: kicker, title (medium), summary, the submissions grid,
// and at the bottom "add your art" plus "propose next week's prompt".
export default function PromptColumn() {
  const navigate = useNavigate();
  const { token, currentUser } = useAuth()!;
  const [active, setActive] = useState<PromptOut | null | undefined>(undefined);
  const [prompt, setPrompt] = useState<PromptDetailOut | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [showPropose, setShowPropose] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [past, setPast] = useState<PromptSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    swr("prompt:active", () => get_active_prompt(token), (p) => { if (!cancelled) setActive(p); })
      .catch(() => { if (!cancelled) setActive(null); });
    return () => { cancelled = true; };
  }, [token]);

  const refresh = useCallback(() => {
    if (!active) return;
    swr(`prompt:${active.id}`, () => get_prompt(active.id, token), setPrompt).catch(() => {});
  }, [active, token]);
  useEffect(() => { refresh(); }, [refresh]);

  const onCreateSubmission = (payload: Visual2DIn) => {
    if (!prompt) return;
    add_new_visual_2d(token, { ...payload, collection_id: prompt.id })
      .then(() => { setShowDialog(false); refresh(); })
      .catch((err) => alert((err as Error).message || "could not submit"));
  };

  const onEditOwn = () => {
    if (!prompt?.viewer_submission_id || !currentUser) return;
    navigate(`/members/${currentUser}/profile?artId=${prompt.viewer_submission_id}&medium=${encodeURIComponent(prompt.media_name)}`);
  };

  const openPast = () => {
    setShowPast(true);
    if (past.length === 0) list_prompts(token).then(setPast).catch(() => {});
  };

  if (active === undefined) return <div className="hp-empty">loading…</div>;
  if (active === null) {
    return (
      <div className="hp-col">
        <div className="hp-kicker">this week's prompt</div>
        <div className="hp-empty">no prompt this week<br /><span>check back soon</span></div>
        <button className="hp-btn hp-btn-plain" onClick={() => setShowPropose(true)}>propose next week's prompt</button>
        {showPropose && <ProposePromptDialog onClose={() => setShowPropose(false)} />}
      </div>
    );
  }

  const submissions = prompt?.submissions ?? [];
  const cols = columnsFor(submissions.length);

  return (
    <div className="hp-col">
      <button className="hp-header" onClick={openPast} title="past prompts">
        <span className="hp-kicker">this week's prompt</span>
        <span className="hp-title">{active.title}{active.media_name ? ` (${active.media_name})` : ""}</span>
        {active.short_summary && <span className="hp-summary">{active.short_summary}</span>}
      </button>

      <div className="hp-grid-box">
        {submissions.length === 0 ? (
          <div className="hp-empty">be the first to submit</div>
        ) : (
          <div className="hp-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {submissions.map((s) => (
              <button key={s.id} className="hp-cell" onClick={() => navigate(`/prompts/${active.id}/grid`)}>
                <ArtImage artId={s.id} fullSrc={s.file_path} alt="" className="hp-cell-img" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="hp-bottom">
        {prompt?.viewer_submission_id ? (
          <button className="hp-btn hp-drop" onClick={onEditOwn}>edit your submission</button>
        ) : (
          <button className="hp-btn hp-drop" onClick={() => setShowDialog(true)}>add your art</button>
        )}
        <button className="hp-btn hp-btn-plain" onClick={() => setShowPropose(true)}>propose next week's prompt</button>
      </div>

      {showDialog && currentUser && (
        <AddArtDialog
          setShowDialog={setShowDialog}
          selectedMedium={active.media_name ?? ""}
          username={currentUser}
          onSuccess={refresh}
          onCreate={onCreateSubmission}
        />
      )}
      {showPropose && <ProposePromptDialog onClose={() => setShowPropose(false)} />}
      {showPast && (
        <div className="hp-modal-backdrop" onClick={() => setShowPast(false)}>
          <div className="dialog hp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="exit"><button onClick={() => setShowPast(false)}>x</button></div>
            <h2 className="hp-modal-title">past prompts</h2>
            <div className="hp-modal-list">
              {past.length === 0 ? <p className="hp-empty">no prompts yet</p> : past.map((p) => (
                <button key={p.id} className={`hp-past-row ${p.is_active ? "current" : ""}`} disabled={p.is_active}
                  onClick={() => { setShowPast(false); navigate(`/prompts/${p.id}`); }}>
                  <span className="hp-past-title">{p.title}</span>
                  <span className={`hp-past-date ${p.is_active ? "live" : ""}`}>
                    {new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Text + a medium (or "any medium"); lands in the admin prompts queue.
function ProposePromptDialog({ onClose }: { onClose: () => void }) {
  const { token } = useAuth()!;
  const [media, setMedia] = useState<MediaType[]>([]);
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => { get_media().then(setMedia).catch(() => {}); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || submitting) return;
    setSubmitting(true);
    try { await create_prompt_suggestion(body, mediaId, token); setDone(true); }
    catch (err) { alert((err as Error).message || "could not propose"); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="hp-modal-backdrop" onClick={onClose}>
      <form className="dialog hp-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="exit"><button type="button" onClick={onClose}>x</button></div>
        <h2 className="hp-modal-title">propose next week's prompt</h2>
        {done ? (
          <p className="hp-summary">sent — an admin will review it.</p>
        ) : (
          <>
            <div className="hp-chips">
              <button type="button" className={`hp-chip ${mediaId === null ? "on" : ""}`} onClick={() => setMediaId(null)}>any medium</button>
              {media.map((m) => (
                <button type="button" key={m.id} className={`hp-chip ${mediaId === m.id ? "on" : ""}`} onClick={() => setMediaId(m.id)}>{m.name}</button>
              ))}
            </div>
            <textarea className="hp-textarea" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="describe the prompt" autoFocus />
            <button type="submit" className="hp-btn hp-drop" disabled={!text.trim() || submitting}>{submitting ? "sending…" : "propose"}</button>
          </>
        )}
      </form>
    </div>
  );
}
