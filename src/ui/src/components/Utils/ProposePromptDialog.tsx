import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { get_media, create_prompt_suggestion, MediaType } from "../../api";
import "../../styles/utils/dialog.css";
import "../../styles/utils/propose-prompt.css";

// Text + a medium (or "any medium"); lands in the admin prompts queue.
export default function ProposePromptDialog({ onClose }: { onClose: () => void }) {
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
    <div className="pp-backdrop" onClick={onClose}>
      <form className="dialog pp-dialog" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="exit"><button type="button" onClick={onClose}>x</button></div>
        <h2 className="pp-title">propose next week's prompt</h2>
        {done ? (
          <p className="pp-note">sent — an admin will review it.</p>
        ) : (
          <>
            <div className="pp-chips">
              <button type="button" className={`pp-chip ${mediaId === null ? "on" : ""}`} onClick={() => setMediaId(null)}>any medium</button>
              {media.map((m) => (
                <button type="button" key={m.id} className={`pp-chip ${mediaId === m.id ? "on" : ""}`} onClick={() => setMediaId(m.id)}>{m.name}</button>
              ))}
            </div>
            <textarea className="pp-textarea" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="describe the prompt" autoFocus />
            <button type="submit" className="pp-submit" disabled={!text.trim() || submitting}>{submitting ? "sending…" : "propose"}</button>
          </>
        )}
      </form>
    </div>
  );
}
