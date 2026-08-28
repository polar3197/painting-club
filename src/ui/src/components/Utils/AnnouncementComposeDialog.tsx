import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { create_announcement } from "../../api";
import "../../styles/utils/dialog.css";
import "../../styles/admin-tools.css";

export default function AnnouncementComposeDialog({ onClose, onPosted }: {
  onClose: () => void;
  onPosted: () => void;
}) {
  const { token } = useAuth()!;
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const canSubmit = !!title.trim() && !!body.trim() && !submitting;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await create_announcement(title.trim(), body.trim(), token);
      onPosted();
      onClose();
    } catch (err) {
      alert((err as Error).message || "could not post");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="compose-backdrop" onClick={onClose}>
      <form className="dialog compose-dialog" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="exit"><button type="button" onClick={onClose}>x</button></div>
        <h2 className="compose-title">new announcement</h2>
        <label className="compose-label">title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="what's happening" autoFocus />
        <label className="compose-label">body</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="the announcement" rows={7} />
        <div className="compose-actions">
          <button type="submit" className="tools-btn" disabled={!canSubmit}>{submitting ? "posting…" : "post"}</button>
        </div>
      </form>
    </div>
  );
}
