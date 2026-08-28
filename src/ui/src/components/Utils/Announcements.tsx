import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { AnnouncementOut, get_announcements } from "../../api";
import { formatWhen } from "../../utils/date";
import "../../styles/announcements.css";

// Home card: the latest announcement, with a "+N" into the full feed. Same
// shape as the iOS Home card. (Composing lives on /contributor.)
export default function Announcements() {
  const navigate = useNavigate();
  const { token } = useAuth()!;
  const [items, setItems] = useState<AnnouncementOut[] | null>(null);

  useEffect(() => {
    get_announcements(token).then(setItems).catch(() => setItems([]));
  }, [token]);

  const latest = items?.[0];
  const more = items ? items.length - 1 : 0;

  return (
    <div className="announcements">
      <div className="announcements-head">
        <h2 className="announcements-header">announcements</h2>
        {more > 0 && (
          <button className="announcements-more" onClick={() => navigate("/announcements")}>+{more}</button>
        )}
      </div>
      {items === null ? (
        <p className="announcements-empty">loading…</p>
      ) : !latest ? (
        <p className="announcements-empty">nothing announced yet.</p>
      ) : (
        <button className="announcement-item" onClick={() => navigate(`/announcements/${latest.id}`)}>
          <span className="announcement-marker">◆</span>
          <span className="announcement-content">
            <span className="announcement-title">{latest.title}</span>
            <span className="announcement-body">{latest.body}</span>
            <span className="announcement-meta">
              {latest.author_firstname || latest.author_username || "someone"} · {formatWhen(latest.created_at)}
              {latest.comment_count > 0 ? ` · ${latest.comment_count} ${latest.comment_count === 1 ? "reply" : "replies"}` : ""}
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
