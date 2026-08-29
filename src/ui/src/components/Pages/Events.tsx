import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { EventOut, list_events } from "../../api";
import { formatEventTime, todayLocalISO } from "../../utils/date";
import MonthCalendar from "../Utils/MonthCalendar";
import { MonthCursor, stepMonth } from "../../utils/calendar";
import { eventsByDate, eventMarks } from "../../utils/events";
import "../../styles/events.css";

export function EventRow({ e, onClick }: { e: EventOut; onClick: () => void }) {
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

// Events as a month calendar; click a day for its events. ?focus=YYYY-MM-DD
// lands on that day (used after creating an event).
export default function Events() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { token } = useAuth()!;
  const [events, setEvents] = useState<EventOut[]>([]);
  const today = todayLocalISO();
  const focus = searchParams.get("focus");
  const [selected, setSelected] = useState<string>(focus || today);
  const [cursor, setCursor] = useState<MonthCursor>(() => {
    const [y, m] = (focus || today).split("-").map(Number);
    return { y, m0: m - 1 };
  });

  // One-shot: consume the focus param so back-navigation doesn't keep
  // yanking the calendar to an old event.
  useEffect(() => {
    if (!focus) return;
    const [y, m] = focus.split("-").map(Number);
    setCursor({ y, m0: m - 1 });
    setSelected(focus);
    setSearchParams({}, { replace: true });
  }, [focus, setSearchParams]);

  const load = useCallback(async () => {
    try { setEvents(await list_events(token)); } catch { /* keep what's on screen */ }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const byDate = useMemo(() => eventsByDate(events), [events]);
  const marks = useMemo(() => eventMarks(byDate), [byDate]);

  const selectedEvents = byDate[selected] || [];
  const [sy, sm, sd] = selected.split("-").map(Number);
  const selectedLabel = new Date(sy, sm - 1, sd).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }).toLowerCase();

  return (
    <main className="page events-page">
      <div className="events-inner">
        <div className="events-header">
          <div className="events-header-left">
            <button className="back-btn" onClick={() => navigate("/home")}>‹ home</button>
            <h1 className="events-title">events</h1>
          </div>
          <div className="events-actions">
            <button className="events-btn" onClick={() => navigate(`/events/new?date=${selected}`)}>+ new event</button>
          </div>
        </div>
        <div className="events-layout">
          <div className="events-cal">
            <MonthCalendar
              cursor={cursor}
              onStep={(d) => setCursor((c) => stepMonth(c, d))}
              selected={selected}
              onSelect={setSelected}
              marks={marks}
            />
          </div>
          <div>
            <h2 className="events-day-title">{selectedLabel}</h2>
            {selectedEvents.length === 0
              ? <p className="events-empty">no events on this day</p>
              : selectedEvents.map((e) => <EventRow key={e.id} e={e} onClick={() => navigate(`/events/${e.id}`)} />)}
          </div>
        </div>
      </div>
    </main>
  );
}
