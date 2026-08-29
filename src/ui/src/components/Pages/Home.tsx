import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useAdminPending } from "../../hooks/useAdminPending";
import { get_active_prompt, list_events, PromptOut, EventOut } from "../../api";
import { parseUtc, todayLocalISO, formatEventWhen } from "../../utils/date";
import MonthCalendar from "../Utils/MonthCalendar";
import Announcements from "../Utils/Announcements";
import { eventsByDate, eventMarks, DEFAULT_EVENT_COLOR } from "../../utils/events";
import "../../styles/app-layout.css";
import "../../styles/home.css";

const PROMPT_LIFESPAN_DAYS = 7;

// Fraction of the prompt's 7-day life still left (1 → 0); null when the
// backend didn't say when it went live.
function promptRemaining(activatedAt: string | null | undefined): number | null {
  if (!activatedAt) return null;
  const start = parseUtc(activatedAt).getTime();
  if (!Number.isFinite(start)) return null;
  const elapsedDays = (Date.now() - start) / 86_400_000;
  return Math.max(0, Math.min(1, 1 - elapsedDays / PROMPT_LIFESPAN_DAYS));
}

// Home: the same things the iOS home leads with — this week's prompt (with
// its 7-day ring), an events square whose calendar shows what's coming, and
// the latest announcement. Interim layout; a fuller redesign is planned.
export default function Home() {
  const navigate = useNavigate();
  const { token } = useAuth()!;
  const adminPending = useAdminPending();
  const [prompt, setPrompt] = useState<PromptOut | null>(null);
  const [events, setEvents] = useState<EventOut[]>([]);

  useEffect(() => {
    let cancelled = false;
    get_active_prompt(token).then((p) => { if (!cancelled) setPrompt(p); }).catch(() => { if (!cancelled) setPrompt(null); });
    list_events(token).then((e) => { if (!cancelled) setEvents(e); }).catch(() => {});
    return () => { cancelled = true; };
  }, [token]);

  const today = todayLocalISO();
  const cursor = useMemo(() => { const [y, m] = today.split("-").map(Number); return { y, m0: m - 1 }; }, [today]);
  const byDate = useMemo(() => eventsByDate(events), [events]);
  const marks = useMemo(() => eventMarks(byDate), [byDate]);
  const upcoming = useMemo(
    () => events.filter((e) => e.event_date >= today).sort((a, b) => (a.event_date + (a.event_time || "")).localeCompare(b.event_date + (b.event_time || ""))),
    [events, today],
  );

  const remaining = promptRemaining(prompt?.activated_at);
  const ringStyle = remaining == null
    ? undefined
    : { background: `conic-gradient(rgb(227, 0, 34) ${remaining * 360}deg, white ${remaining * 360}deg)` };

  return (
    <main className="page">
      <div className="home">
        <div className="home-top">
          <div className="home-title">-• Painting Club •-</div>
          {adminPending.total > 0 && (
            <button className="home-admin-alert" onClick={() => navigate("/admin")}>
              {adminPending.total} {adminPending.total === 1 ? "request" : "requests"} to review
            </button>
          )}
        </div>

        <div className="home-body">
          {/* events: left half, full height */}
          <div className="home-events" onClick={() => navigate("/events")} role="link" tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter") navigate("/events"); }}>
            <div className="home-square-head">
              <span className="home-square-label">events</span>
              <span className="home-square-link">open ›</span>
            </div>
            <MonthCalendar cursor={cursor} marks={marks} />
            <div className="home-upcoming">
              <span className="home-upcoming-label">coming up</span>
              {upcoming.length === 0 ? (
                <span className="home-upcoming-empty">nothing coming up</span>
              ) : upcoming.map((e) => (
                <span key={e.id} className="home-upcoming-row" onClick={(ev) => { ev.stopPropagation(); navigate(`/events/${e.id}`); }}>
                  <span className="home-upcoming-dot" style={{ backgroundColor: e.color || DEFAULT_EVENT_COLOR }} />
                  <span className="home-upcoming-title">{e.title}</span>
                  <span className="home-upcoming-when">{formatEventWhen(e.event_date, e.event_time)}</span>
                </span>
              ))}
            </div>
          </div>

          {/* right half: week's prompt above the latest announcement */}
          <div className="home-side">
            <button
              className={`home-square home-square-prompt ${prompt ? "" : "empty"}`}
              onClick={() => prompt && navigate(`/prompts/${prompt.id}`)}
              disabled={!prompt}
            >
              <span className="prompt-ring" style={ringStyle}>
                <span className="prompt-ring-inner">
                  <span className="prompt-label">week's prompt</span>
                  {prompt ? (
                    <>
                      <span className="prompt-title">{prompt.title}</span>
                      <span className="prompt-medium">{prompt.media_name ?? "any medium"}</span>
                    </>
                  ) : (
                    <span className="prompt-medium">no prompt this week</span>
                  )}
                </span>
              </span>
            </button>
            <Announcements />
          </div>
        </div>
      </div>
    </main>
  );
}
