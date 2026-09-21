import { useCallback, useEffect, useRef, useState } from "react";
import { CommentReceivedOut, get_comments_received } from "../../profileApi";

// Page 2 of the owner's statement carousel (iOS CommentsReceivedPanel): other
// members' comments on your pieces, newest first, gold until seen. Tapping one
// jumps to that piece on the profile.
export default function CommentsReceivedPanel({ onOpen }: { onOpen: (artId: string, medium: string) => void }) {
  const [rows, setRows] = useState<CommentReceivedOut[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [seenBefore, setSeenBefore] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const busy = useRef(false);

  const load = useCallback(async (from: string | null) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const page = await get_comments_received(from);
      setRows((r) => (from ? [...r, ...page.comments] : page.comments));
      if (!from) setSeenBefore(page.previous_view_at);
      setCursor(page.next_cursor);
      setDone(!page.next_cursor);
    } catch {
      setDone(true);
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => { load(null); }, [load]);

  if (rows.length === 0 && done) {
    return <div className="comments-received-empty">ppls comments on ur posts will appear here</div>;
  }

  return (
    <div
      className="comments-received"
      onScroll={(e) => {
        const el = e.currentTarget;
        if (!done && cursor && el.scrollTop + el.clientHeight >= el.scrollHeight - 40) load(cursor);
      }}
    >
      {rows.map((c) => {
        const unseen = !seenBefore || c.created_at > seenBefore;
        return (
          <button
            key={c.id}
            className={`comment-received-row${unseen ? " unseen" : ""}`}
            onClick={() => onOpen(c.art_id, c.art_medium)}
          >
            {c.text} -{c.commenter_username}
          </button>
        );
      })}
    </div>
  );
}
