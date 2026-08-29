import { EventOut } from "../../api";
import { formatEventTime } from "../../utils/date";
import "../../styles/events.css";

export default function EventRow({ e, onClick }: { e: EventOut; onClick: () => void }) {
  return (
    <button className="event-row" onClick={onClick}>
      {e.image_path
        ? <img className="event-thumb" src={e.image_path} alt="" />
        : <span className="event-thumb" style={e.color ? { backgroundColor: e.color } : undefined} />}
      <span className="event-row-main">
        <span className="event-row-title">{e.title}</span>
        <span className="event-row-meta">
          {e.event_time ? formatEventTime(e.event_time) : "all day"} · {e.is_public ? "public" : "invite-only"}
        </span>
      </span>
    </button>
  );
}
