import { useEffect, useState } from "react";
import { AudioOut, remove_audio } from "../../profileApi";
import BookmarkButton from "../Utils/BookmarkButton";
import ConfirmDialog from "../Utils/ConfirmDialog";

// One shared <audio> for the whole page, so starting a track stops the last
// one (the iOS global player queue, minus the queue).
const player = typeof Audio !== "undefined" ? new Audio() : null;
let playingId: string | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
if (player) {
  for (const ev of ["play", "pause", "ended", "timeupdate", "loadedmetadata"]) player.addEventListener(ev, notify);
}

function usePlayer(piece: AudioOut) {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  const mine = playingId === piece.id;
  const playing = mine && !!player && !player.paused;
  const toggle = () => {
    if (!player) return;
    if (!mine) {
      playingId = piece.id;
      player.src = piece.file_path;
      player.play().catch(() => {});
    } else if (player.paused) player.play().catch(() => {});
    else player.pause();
    notify();
  };
  const time = mine && player ? player.currentTime : 0;
  const duration = (mine && player && isFinite(player.duration) ? player.duration : null) ?? piece.duration_seconds ?? 0;
  const seek = (t: number) => { if (mine && player) player.currentTime = t; };
  return { playing, toggle, time, duration, seek, mine };
}

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

function PlayButton({ piece, size }: { piece: AudioOut; size: number }) {
  const { playing, toggle } = usePlayer(piece);
  return (
    <button className="audio-play" style={{ width: size, height: size, fontSize: size * 0.4 }} aria-label={playing ? "pause" : "play"} onClick={(e) => { e.stopPropagation(); toggle(); }}>
      {playing ? "❚❚" : "▶"}
    </button>
  );
}

// A single track card: title + artist, a gold ▶ and bookmark; tapping the card
// expands the player bar (scrub + times) and the owner's remove.
export function AudioPiece({ piece, isOwner, onRemove }: { piece: AudioOut; isOwner: boolean; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const { time, duration, seek, mine } = usePlayer(piece);
  return (
    <div className="art-element audio-card" onClick={() => setOpen((o) => !o)}>
      {confirm && (
        <ConfirmDialog
          onConfirm={async () => { setConfirm(false); await remove_audio(piece.id).catch(() => {}); onRemove(); }}
          onCancel={() => setConfirm(false)}
        />
      )}
      <div className="audio-head">
        <div className="audio-titles">
          <div className="art-details-title">{piece.title}</div>
          {piece.artist && <div className="audio-artist">{piece.artist}</div>}
        </div>
        {!open && <PlayButton piece={piece} size={34} />}
        <BookmarkButton artIds={[piece.id]} size={34} />
      </div>
      {open && (
        <div className="audio-expanded" onClick={(e) => e.stopPropagation()}>
          {piece.date && <div className="audio-date">{piece.date}</div>}
          <div className="audio-bar">
            <PlayButton piece={piece} size={44} />
            <input
              className="audio-scrub"
              type="range"
              min={0}
              max={duration || 1}
              step={0.1}
              value={mine ? time : 0}
              onChange={(e) => seek(Number(e.target.value))}
            />
            <span className="audio-times">{fmt(mine ? time : 0)} / {fmt(duration)}</span>
          </div>
          {isOwner && (
            <div className="art-footer-main">
              <button className="art-btn" onClick={() => setConfirm(true)}>remove</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// An album (audio series): header with title, "N tracks", › to fold, and a
// save-all bookmark; numbered track rows with duration and a ▶ each.
export function AlbumTile({ name, pieces }: { name: string; pieces: AudioOut[] }) {
  const [open, setOpen] = useState(true);
  const ordered = [...pieces].sort((a, b) => (a.order_index ?? 1e9) - (b.order_index ?? 1e9));
  return (
    <div className="art-element audio-card">
      <div className="audio-head" onClick={() => setOpen((o) => !o)}>
        <div className="audio-titles">
          <div className="art-details-title">{name}</div>
          <div className="album-count">{ordered.length} tracks</div>
        </div>
        <span className="album-chevron">{open ? "⌄" : "›"}</span>
        <BookmarkButton artIds={ordered.map((p) => p.id)} size={34} />
      </div>
      {open && (
        <div className="album-tracks">
          {ordered.map((p, i) => (
            <div key={p.id} className="album-track">
              <span className="album-track-n">{i + 1}.</span>
              <span className="album-track-title">{p.title}</span>
              {p.duration_seconds ? <span className="album-track-dur">{fmt(p.duration_seconds)}</span> : null}
              <PlayButton piece={p} size={26} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
