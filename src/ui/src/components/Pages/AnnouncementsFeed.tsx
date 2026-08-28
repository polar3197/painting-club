import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { AnnouncementOut, get_announcements } from "../../api";
import { formatWhen } from "../../utils/date";
import { ToolsPage } from "../Utils/ToolsPage";

// Every announcement, newest first. Reached from the Home card's "+N".
export default function AnnouncementsFeed() {
  const navigate = useNavigate();
  const { token } = useAuth()!;
  const [items, setItems] = useState<AnnouncementOut[] | null>(null);

  useEffect(() => {
    get_announcements(token).then(setItems).catch(() => setItems([]));
  }, [token]);

  return (
    <ToolsPage title="announcements" contributorOnly={false}>
      {items === null ? <p className="tools-empty">loading…</p>
        : items.length === 0 ? <p className="tools-empty">nothing announced yet.</p>
        : items.map((a) => (
          <button key={a.id} className="tools-row" onClick={() => navigate(`/announcements/${a.id}`)}>
            <span className="tools-row-main">
              <span className="tools-row-title">{a.title}</span>
              <span className="tools-row-body">{a.body}</span>
              <span className="tools-row-meta">
                {a.author_firstname || a.author_username || "someone"} · {formatWhen(a.created_at)}
                {a.comment_count > 0 ? ` · ${a.comment_count} ${a.comment_count === 1 ? "reply" : "replies"}` : ""}
              </span>
            </span>
          </button>
        ))}
    </ToolsPage>
  );
}
