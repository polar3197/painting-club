import { useBookmarked } from "../../hooks/useMarks";

// Square hand-drawn bookmark toggle (the iOS BookmarkButton): cream, gold while
// saved. Pass several ids to save a whole series — saved only when all are.
export default function BookmarkButton({ artIds, size = 30 }: { artIds: string[]; size?: number }) {
  const [on, toggle] = useBookmarked(artIds);
  return (
    <button
      type="button"
      className={`bookmark-btn${on ? " on" : ""}`}
      style={{ width: size, height: size }}
      aria-label={on ? "remove bookmark" : "bookmark"}
      aria-pressed={on}
      onClick={(e) => { e.stopPropagation(); toggle(); }}
    >
      <img src="/imgs/bookmark.png" alt="" style={{ width: size * 0.62, height: size * 0.62, opacity: on ? 1 : 0.85 }} />
    </button>
  );
}
