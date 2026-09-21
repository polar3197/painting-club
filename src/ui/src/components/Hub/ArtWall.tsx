import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArtResult, get_media, get_members, get_members_written_form, search_art } from "../../api";
import { get_members_audio } from "../../profileApi";
import { useAuth } from "../../context/AuthContext";
import { swr, getCached } from "../../cache";
import { useAllPins } from "../../hooks/useMarks";
import { WallType } from "../../profileApi";
import ArtImage from "../Utils/ArtImage";

type WallItem = ArtResult & { art_type?: string | null; cover_image_path?: string | null };

const typeOf = (a: WallItem): WallType =>
  a.art_type === "audio" ? "audio" : a.art_type === "written_form" ? "written_form" : "visual_2d";

// Search returns visual pieces; writing + audio are fanned out per member per
// medium (same as the iOS feed).
async function fetchWrittenAndAudio(token: string | null): Promise<WallItem[]> {
  const [media, members] = await Promise.all([get_media().catch(() => []), get_members("", "", token).catch(() => [])]);
  const written = new Set(media.filter((m) => m.type === "written_form").map((m) => m.name));
  const audio = new Set(media.filter((m) => m.type === "audio").map((m) => m.name));
  const jobs: Promise<WallItem[]>[] = [];
  for (const m of members) {
    for (const medium of m.media ?? []) {
      const base = { medium, creator_username: m.username, creator_city: m.city ?? null, aspect_ratio: null, location: null };
      if (written.has(medium)) {
        jobs.push(get_members_written_form(m.username, medium).then((ps) => ps.map((p) => ({
          ...base, id: p.id, title: p.title, art_type: "written_form", keywords: p.keywords ?? [], song: null,
          file_path: p.file_path, date: p.date, cover_image_path: p.cover_image_path ?? null,
        }))).catch(() => []));
      } else if (audio.has(medium)) {
        jobs.push(get_members_audio(m.username, medium).then((ps) => ps.map((p) => ({
          ...base, id: p.id, title: p.title, art_type: "audio", keywords: p.keywords ?? [], song: p.artist,
          file_path: p.file_path, date: p.date, cover_image_path: null,
        }))).catch(() => []));
      }
    }
  }
  return (await Promise.all(jobs)).flat();
}

// Stable per-person "random" pick so a wall doesn't reshuffle every render.
function seededIndex(seed: string, n: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h) % Math.max(1, n);
}

const COLUMNS: { type: WallType; label: string }[] = [
  { type: "written_form", label: "written" },
  { type: "visual_2d", label: "visual" },
  { type: "audio", label: "audio" },
];

// The hub's "art wall": written / visual / audio walls as three same-width
// columns, one piece per person — their pinned piece (red outline, first) or
// a stable-random one. Web twin of ios-v1 WallScreen's ArtWall.
export default function ArtWall() {
  const navigate = useNavigate();
  const { token } = useAuth()!;
  const pinOf = useAllPins();
  const [visual, setVisual] = useState<WallItem[]>(() => getCached<WallItem[]>("wall:visual") ?? []);
  const [extra, setExtra] = useState<WallItem[]>(() => getCached<WallItem[]>("wall:extra") ?? []);

  useEffect(() => {
    swr("wall:visual", () => search_art(""), setVisual).catch(() => {});
    swr("wall:extra", () => fetchWrittenAndAudio(token), setExtra).catch(() => {});
  }, [token]);

  const columns = useMemo(() => {
    const byId = new Map<string, WallItem>();
    for (const a of [...visual, ...extra]) if (!byId.has(a.id)) byId.set(a.id, a);
    const out: Record<WallType, { piece: WallItem; pinned: boolean }[]> = { written_form: [], visual_2d: [], audio: [] };
    for (const { type } of COLUMNS) {
      const byPerson = new Map<string, WallItem[]>();
      for (const a of byId.values()) {
        if (typeOf(a) !== type) continue;
        byPerson.set(a.creator_username, [...(byPerson.get(a.creator_username) ?? []), a]);
      }
      for (const [username, pieces] of byPerson) {
        const pinId = pinOf(username, type);
        const pinned = pinId ? pieces.find((p) => p.id === pinId) : undefined;
        const piece = pinned ?? pieces[seededIndex(username + type, pieces.length)];
        out[type].push({ piece, pinned: !!pinned });
      }
      out[type].sort((a, b) => (a.pinned !== b.pinned ? (a.pinned ? -1 : 1) : a.piece.creator_username.localeCompare(b.piece.creator_username)));
    }
    return out;
  }, [visual, extra, pinOf]);

  const open = (a: WallItem) =>
    navigate(`/members/${a.creator_username}/profile?artId=${a.id}&medium=${encodeURIComponent(a.medium)}`);

  return (
    <div className="art-wall">
      <div className="art-wall-title">art wall</div>
      <div className="art-wall-row">
        {COLUMNS.map(({ type, label }) => (
          <div key={type} className="art-wall-col">
            <div className="art-wall-label">{label}</div>
            <div className="art-wall-scroll">
              {columns[type].length === 0 ? (
                <span className="art-wall-empty">nothing here yet</span>
              ) : (
                columns[type].map(({ piece, pinned }) => (
                  <button key={piece.id} className={`art-wall-tile${pinned ? " pinned" : ""}`} onClick={() => open(piece)}>
                    {type === "visual_2d" ? (
                      <ArtImage piece={piece} sizes="108px" />
                    ) : type === "written_form" && piece.cover_image_path ? (
                      <img src={piece.cover_image_path} alt={piece.title} loading="lazy" decoding="async" />
                    ) : (
                      <span className="art-wall-glyph">
                        <img src={type === "audio" ? "/imgs/music.png" : "/imgs/writing.png"} alt="" />
                        <span>{piece.title}</span>
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
      <button className="art-wall-all" onClick={() => navigate("/art")}>see everything</button>
    </div>
  );
}
