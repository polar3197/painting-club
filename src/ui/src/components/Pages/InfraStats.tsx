import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { InfraHealthOut, get_infra_health } from "../../api";
import { ToolsPage, Section } from "../Utils/ToolsPage";

const REFRESH_MS = 15000;

function fmtBytes(n: number | null | undefined): string {
  if (n == null) return "—";
  const gb = n / 1e9;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = n / 1e6;
  if (mb >= 1) return `${mb.toFixed(0)} MB`;
  return `${(n / 1e3).toFixed(0)} KB`;
}

function fmtUptime(s: number): string {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

function meterColor(p: number | null): string {
  if (p == null) return "rgba(0,0,0,0.2)";
  if (p >= 90) return "rgb(227, 0, 34)";
  if (p >= 70) return "rgb(238, 190, 100)";
  return "rgb(119, 197, 119)";
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="tools-kv"><span className="tools-kv-label">{label}</span><span>{value}</span></div>
);

const Meter = ({ label, percent, value }: { label: string; percent: number | null; value: string }) => {
  const pct = percent == null ? 0 : Math.max(0, Math.min(100, percent));
  return (
    <div className="tools-meter">
      <div className="tools-meter-head"><span className="tools-kv-label">{label}</span><span>{value}</span></div>
      <div className="tools-bar-track"><div className="tools-bar-fill" style={{ width: `${pct}%`, backgroundColor: meterColor(percent) }} /></div>
    </div>
  );
};

// Contributor "infra stats": live Raspberry Pi host health from /infra/health,
// refreshed every 15s. Read-only.
export default function InfraStats() {
  const { token } = useAuth()!;
  const [data, setData] = useState<InfraHealthOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try { setData(await get_infra_health(token)); setError(false); }
    catch { setError(true); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    load();
    const iv = setInterval(load, REFRESH_MS);
    return () => clearInterval(iv);
  }, [load]);

  const sub = `raspberry pi · ${data?.kernel || "host"}${data?.uptime_seconds != null ? ` · up ${fmtUptime(data.uptime_seconds)}` : ""}`;

  return (
    <ToolsPage title="infra stats" sub={sub}>
      {loading ? (
        <p className="tools-empty">loading…</p>
      ) : error && !data ? (
        <p className="tools-empty">couldn't reach the pi.</p>
      ) : data && !data.host_metrics_available ? (
        <p className="tools-empty">host metrics unavailable here (the api isn't running on the pi).</p>
      ) : data && (
        <>
          <Section title="cpu">
            <Meter label="usage" percent={data.cpu.percent} value={data.cpu.percent != null ? `${data.cpu.percent}%` : "—"} />
            <Row label="cores" value={data.cpu.cores != null ? String(data.cpu.cores) : "—"} />
            <Row label="load (1 · 5 · 15m)" value={[data.cpu.load_1, data.cpu.load_5, data.cpu.load_15].map((l) => (l != null ? l.toFixed(2) : "—")).join("  ")} />
          </Section>
          <Section title="memory">
            <Meter label="used" percent={data.memory.percent} value={`${fmtBytes(data.memory.used)} / ${fmtBytes(data.memory.total)}`} />
            <Row label="available" value={fmtBytes(data.memory.available)} />
          </Section>
          <Section title="system disk (sd card)">
            <Meter label="used" percent={data.disk.percent} value={`${fmtBytes(data.disk.used)} / ${fmtBytes(data.disk.total)}`} />
            <Row label="free" value={fmtBytes(data.disk.free)} />
          </Section>
          <Section title="media drive (usb)">
            <p className="tools-note">the external drive uploads live on — the one that actually fills up.</p>
            <Meter label="used" percent={data.content_disk.percent} value={`${fmtBytes(data.content_disk.used)} / ${fmtBytes(data.content_disk.total)}`} />
            <Row label="free" value={fmtBytes(data.content_disk.free)} />
          </Section>
          <Section title="people's content">
            <p className="tools-note">uploaded art + profile images (the static-files volume) — this rides on the media drive above.</p>
            <Row label="size" value={fmtBytes(data.content.bytes)} />
            <Row label="files" value={data.content.files != null ? `${data.content.files.toLocaleString()}${data.content.truncated ? "+" : ""}` : "—"} />
          </Section>
          {data.temperature_c != null && (
            <Section title="temperature"><Row label="cpu temp" value={`${data.temperature_c}°C`} /></Section>
          )}
        </>
      )}
    </ToolsPage>
  );
}
