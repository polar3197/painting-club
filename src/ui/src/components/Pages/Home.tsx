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
import FeatureBoard from "../Home/FeatureBoard";
import "../../styles/app-layout.css";
import "../../styles/home.css";

// Home: a fixed-width left stack (title, About bookshelf, feature board —
// the shelf and board split the height) beside the week's prompt over
// events. The calendar
// lives here (there's no separate events page): pick a day to see its
// events beside it, open one to read it, and its back button returns here.
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
        <div className="home-left">
          <Bulletin />
          <FeatureBoard />
        </div>
        <PromptColumn />

        <div className="home-events">
            <div className="home-square-head">
              <span className="home-square-label">events</span>
              <button className="home-square-link" onClick={() => navigate("/events/new")}>+ new event</button>
            </div>
            <div className="home-events-body">
              <div className="home-events-cal">
                <MonthCalendar
                  cursor={cursor}
                  onStep={(d) => setCursor((c) => stepMonth(c, d))}
                  selected={selected}
                  onSelect={setSelected}
                  marks={marks}
                  compact
                  fill
                />
              </div>
              <div className="home-day">
                <span className="home-upcoming-label">{selected === today ? "today" : dayLabel}</span>
                {dayEvents.length === 0
                  ? <span className="home-upcoming-empty">no events on this day</span>
                  : dayEvents.map((e) => <EventRow key={e.id} e={e} onClick={() => navigate(`/events/${e.id}`)} />)}
              </div>
            </div>
          </div>
      </div>
    </main>
  );
}
