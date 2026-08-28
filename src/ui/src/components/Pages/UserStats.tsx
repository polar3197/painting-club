import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { UsageSummary, get_usage_summary } from "../../api";
import { ToolsPage, Section } from "../Utils/ToolsPage";

const WINDOW_DAYS = 14;

// "2026-07-14" -> "07/14"
const shortDate = (iso: string) => { const [, m, d] = iso.split("-"); return `${m}/${d}`; };

function BarRow({ label, count, max, accent }: { label: string; count: number; max: number; accent?: string }) {
  return (
    <div className="tools-bar-row">
      <span className="tools-bar-label" title={label}>{label}</span>
      <div className="tools-bar-track">
        <div className="tools-bar-fill" style={{ width: `${Math.round((count / max) * 100)}%`, ...(accent ? { backgroundColor: accent } : {}) }} />
      </div>
      <span className="tools-bar-count">{count}</span>
    </div>
  );
}

// Contributor "user stats": visits + active members per day and the busiest
// screens, from /usage/summary. Read-only.
export default function UserStats() {
  const { token } = useAuth()!;
  const [data, setData] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try { setData(await get_usage_summary(WINDOW_DAYS, token)); setError(false); }
    catch { setError(true); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const maxOf = (xs: number[]) => Math.max(1, ...xs);
  const activeToday = data?.active_today ?? [];

  return (
    <ToolsPage title="user stats" sub={`last ${data?.days ?? WINDOW_DAYS} days`}
      action={<button className="tools-btn" onClick={load}>refresh</button>}>
      {loading ? (
        <p className="tools-empty">loading…</p>
      ) : error && !data ? (
        <p className="tools-empty">couldn't load stats.</p>
      ) : data && (
        <>
          <div className="tools-tiles">
            <div className="tools-tile"><span className="tools-tile-value">{data.total_visits}</span><span className="tools-tile-label">visits</span></div>
            <div className="tools-tile"><span className="tools-tile-value">{activeToday.length}</span><span className="tools-tile-label">active today</span></div>
          </div>
          <Section title="active today">
            {activeToday.length === 0 ? <p className="tools-empty">nobody yet today</p> : activeToday.map((m) => (
              <div key={m.username} className="tools-member-row">
                <span>{m.firstname || m.username}</span>
                <span className="tools-member-handle">@{m.username}</span>
              </div>
            ))}
          </Section>
          <Section title="visits per day">
            {data.visits_per_day.length === 0 ? <p className="tools-empty">no visits yet</p> :
              data.visits_per_day.map((d) => <BarRow key={d.date} label={shortDate(d.date)} count={d.count} max={maxOf(data.visits_per_day.map((x) => x.count))} />)}
          </Section>
          <Section title="active members per day">
            {data.active_per_day.length === 0 ? <p className="tools-empty">no activity yet</p> :
              data.active_per_day.map((d) => <BarRow key={d.date} label={shortDate(d.date)} count={d.count} max={maxOf(data.active_per_day.map((x) => x.count))} accent="rgb(119, 197, 119)" />)}
          </Section>
          <Section title="top screens">
            {data.top_screens.length === 0 ? <p className="tools-empty">no screen traffic yet</p> :
              data.top_screens.map((s) => <BarRow key={s.screen} label={s.screen} count={s.count} max={maxOf(data.top_screens.map((x) => x.count))} accent="rgb(238, 190, 100)" />)}
          </Section>
        </>
      )}
    </ToolsPage>
  );
}
