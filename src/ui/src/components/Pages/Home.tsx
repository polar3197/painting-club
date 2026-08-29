import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { list_events, EventOut } from "../../api";
import { swr } from "../../cache";
import { todayLocalISO } from "../../utils/date";
import { MonthCursor, stepMonth } from "../../utils/calendar";
import { eventsByDate, eventMarks } from "../../utils/events";
import MonthCalendar from "../Utils/MonthCalendar";
import EventRow from "../Utils/EventRow";
import Bulletin from "../Home/Bulletin";
import PromptColumn from "../Home/PromptColumn";
import "../../styles/app-layout.css";
import "../../styles/home.css";

// Home in three full-height thirds: the bulletin, the week's prompt as a
// small gallery, and events. The calendar lives here (there's no separate
// events page): pick a day to see its events, open one to read it, and its
// back button returns here.
export default function Home() {
  const navigate = useNavigate();
  const { token } = useAuth()!;
  const [events, setEvents] = useState<EventOut[]>([]);
  const today = todayLocalISO();
  const [selected, setSelected] = useState(today);
  const [cursor, setCursor] = useState<MonthCursor>(() => { const [y, m] = today.split("-").map(Number); return { y, m0: m - 1 }; });

  useEffect(() => {
    let cancelled = false;
    swr("events", () => list_events(token), (e) => { if (!cancelled) setEvents(e); }).catch(() => {});
    return () => { cancelled = true; };
  }, [token]);

  const byDate = useMemo(() => eventsByDate(events), [events]);
  const marks = useMemo(() => eventMarks(byDate), [byDate]);
  const dayEvents = byDate[selected] || [];
  const [sy, sm, sd] = selected.split("-").map(Number);
  const dayLabel = new Date(sy, sm - 1, sd).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }).toLowerCase();

  return (
    <main className="page">
      <div className="home">
        <Bulletin />

        <div className="home-prompt">
          <PromptColumn />
        </div>

        <div className="home-events">
          <div className="home-square-head">
            <span className="home-square-label">events</span>
            <button className="home-square-link" onClick={() => navigate("/events/new")}>+ new event</button>
          </div>
          <MonthCalendar
            cursor={cursor}
            onStep={(d) => setCursor((c) => stepMonth(c, d))}
            selected={selected}
            onSelect={setSelected}
            marks={marks}
          />
          <div className="home-day">
            <span className="home-upcoming-label">{selected === today ? "today" : dayLabel}</span>
            {dayEvents.length === 0
              ? <span className="home-upcoming-empty">no events on this day</span>
              : dayEvents.map((e) => <EventRow key={e.id} e={e} onClick={() => navigate(`/events/${e.id}`)} />)}
          </div>
        </div>
      </div>
    </main>
  );
}
