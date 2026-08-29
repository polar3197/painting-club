import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  get_announcement, add_announcement_comment, delete_announcement, delete_announcement_comment,
  AnnouncementDetailOut, AnnouncementCommentOut,
} from "../../api";
import { formatWhen } from "../../utils/date";
import { ToolsPage } from "../Utils/ToolsPage";
import ConfirmDialog from "../Utils/ConfirmDialog";

// One announcement + its discussion. Any member can read and reply; the
// author or a contributor can delete the announcement or any comment (the
// backend enforces the same rule).
export default function AnnouncementDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token, currentUser, currentRole } = useAuth()!;
  const [data, setData] = useState<AnnouncementDetailOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmDeleteAnn, setConfirmDeleteAnn] = useState(false);
  const [confirmDeleteComment, setConfirmDeleteComment] = useState<string | null>(null);

  const isModerator = currentRole === "contributor" || currentRole === "admin";

  const load = useCallback(async () => {
    try {
      setData(await get_announcement(id, token));
      setNotFound(false);
    } catch (err) {
      if (/not found/i.test((err as Error).message || "")) setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => { load(); }, [load]);

  const canDeleteAnnouncement = !!data && (data.author_username === currentUser || isModerator);
  const canDeleteComment = (c: AnnouncementCommentOut) => c.username === currentUser || isModerator;

  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    try {
      const c = await add_announcement_comment(id, text, token);
      setData((prev) => prev ? { ...prev, comments: [...prev.comments, c], comment_count: prev.comment_count + 1 } : prev);
    } catch (err) {
      setInput(text);
      alert((err as Error).message || "could not post your reply");
    } finally {
      setSending(false);
    }
  };

  const doDeleteAnnouncement = async () => {
    setConfirmDeleteAnn(false);
    try { await delete_announcement(id, token); navigate(-1); }
    catch (err) { alert((err as Error).message || "could not delete"); }
  };

  const doDeleteComment = async (commentId: string) => {
    setConfirmDeleteComment(null);
    try {
      await delete_announcement_comment(id, commentId, token);
      setData((prev) => prev ? {
        ...prev,
        comments: prev.comments.filter((c) => c.id !== commentId),
        comment_count: Math.max(0, prev.comment_count - 1),
      } : prev);
    } catch (err) {
      alert((err as Error).message || "could not delete");
    }
  };

  return (
    <ToolsPage
      title="announcement"
      contributorOnly={false}
      onBack={() => navigate(-1)}
      action={canDeleteAnnouncement && (
        <button className="tools-btn tools-btn-danger" onClick={() => setConfirmDeleteAnn(true)}>delete</button>
      )}
    >
      {confirmDeleteAnn && (
        <ConfirmDialog
          message="delete this announcement? its whole discussion goes with it."
          confirmLabel="delete"
          cancelLabel="keep it"
          onConfirm={doDeleteAnnouncement}
          onCancel={() => setConfirmDeleteAnn(false)}
        />
      )}
      {confirmDeleteComment !== null && (
        <ConfirmDialog
          message="delete this comment?"
          confirmLabel="delete"
          cancelLabel="keep it"
          onConfirm={() => doDeleteComment(confirmDeleteComment)}
          onCancel={() => setConfirmDeleteComment(null)}
        />
      )}
      {loading ? (
        <p className="tools-empty">loading…</p>
      ) : notFound || !data ? (
        <p className="tools-empty">this announcement is gone.</p>
      ) : (
        <>
          <h2 className="ann-title">{data.title}</h2>
          <p className="ann-meta">{data.author_firstname || data.author_username || "someone"} · {formatWhen(data.created_at)}</p>
          <p className="ann-body">{data.body}</p>
          <hr className="ann-divider" />
          <p className="tools-sub">
            {data.comment_count === 0 ? "no replies yet" : `${data.comment_count} ${data.comment_count === 1 ? "reply" : "replies"}`}
          </p>
          {data.comments.map((c) => (
            <div key={c.id} className="ann-comment">
              <div className="ann-comment-head">
                <span className="ann-comment-author">{c.firstname || c.username}</span>
                <span className="ann-comment-time">{formatWhen(c.created_at)}</span>
                {canDeleteComment(c) && (
                  <button className="ann-comment-delete" onClick={() => setConfirmDeleteComment(c.id)}>delete</button>
                )}
              </div>
              <p className="ann-comment-text">{c.text}</p>
            </div>
          ))}
          <form className="ann-input-bar" onSubmit={submitComment}>
            <textarea
              className="ann-input"
              value={input}
              placeholder="add a reply…"
              rows={2}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitComment(e); }}
            />
            <button type="submit" className="ann-send" disabled={!input.trim() || sending} aria-label="send">↑</button>
          </form>
        </>
      )}
    </ToolsPage>
  );
}
