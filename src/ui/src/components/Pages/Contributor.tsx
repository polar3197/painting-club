import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { AnnouncementOut, get_announcements, delete_announcement } from "../../api";
import { ToolsPage } from "../Utils/ToolsPage";
import ConfirmDialog from "../Utils/ConfirmDialog";
import AnnouncementComposeDialog from "../Utils/AnnouncementComposeDialog";

// Contributor-only hub (Settings → "contributor"): author and moderate
// announcements. Click a row for its discussion; delete from the row.
export default function Contributor() {
  const navigate = useNavigate();
  const { token } = useAuth()!;
  const [items, setItems] = useState<AnnouncementOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AnnouncementOut | null>(null);

  const load = useCallback(async () => {
    try { setItems(await get_announcements(token)); }
    catch { /* keep what's on screen */ }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const confirmDelete = async () => {
    const target = pendingDelete;
    if (!target) return;
    setPendingDelete(null);
    setItems((prev) => prev.filter((a) => a.id !== target.id));
    try { await delete_announcement(target.id, token); }
    catch { load(); }
  };

  return (
    <ToolsPage
      title="contributor" onBack={() => navigate("/settings")}
      sub="announcements — click to open its discussion"
      action={<button className="tools-btn" onClick={() => setComposing(true)}>+ announcement</button>}
    >
      {pendingDelete && (
        <ConfirmDialog
          message="delete this announcement?"
          confirmLabel="yes, delete"
          cancelLabel="keep it"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
      {composing && (
        <AnnouncementComposeDialog onClose={() => setComposing(false)} onPosted={load} />
      )}
      {loading ? (
        <p className="tools-empty">loading…</p>
      ) : items.length === 0 ? (
        <p className="tools-empty">no announcements yet. post one with +.</p>
      ) : (
        items.map((a) => (
          <div key={a.id} className="tools-row" role="button" tabIndex={0}
            onClick={() => navigate(`/announcements/${a.id}`)}
            onKeyDown={(e) => { if (e.key === "Enter") navigate(`/announcements/${a.id}`); }}
          >
            <div className="tools-row-main">
              <span className="tools-row-title">{a.title}</span>
              <span className="tools-row-body">{a.body}</span>
              <span className="tools-row-meta">
                {a.comment_count > 0 ? `${a.comment_count} ${a.comment_count === 1 ? "reply" : "replies"}` : "no replies yet"}
              </span>
            </div>
            <div className="tools-row-actions">
              <button className="tools-btn tools-btn-danger" onClick={(e) => { e.stopPropagation(); setPendingDelete(a); }}>
                delete
              </button>
            </div>
          </div>
        ))
      )}
    </ToolsPage>
  );
}
