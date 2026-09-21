import { useEffect, useState } from "react";
import { rename_series, remove_visual_2d, set_series_order } from "../../api";
import { SeriesPiece, seriesOrder } from "./seriesOrder";
import { useAuth } from "../../context/AuthContext";
import AddArtDialog from "../Utils/AddArtDialog";
import ArtCarousel from "../Utils/ArtCarousel";
import ArtImage, { GRID_SIZES } from "../Utils/ArtImage";
import BookmarkButton from "../Utils/BookmarkButton";
import ConfirmDialog from "../Utils/ConfirmDialog";


// A painting series collapsed into one card (iOS PaintingSeriesRow): the first
// piece as cover with a gold 1/N badge, the series name + a save-all bookmark,
// "series of N", and an owner "edit". Tapping opens the series page.
export default function PaintingSeriesRow({
  isOwner,
  seriesId,
  seriesName,
  pieces,
  username,
  selectedMedium,
  onRefresh,
}: {
  isOwner: boolean;
  seriesId: string;
  seriesName: string;
  pieces: SeriesPiece[];
  username: string;
  selectedMedium: string;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ordered = seriesOrder(pieces);
  const cover = ordered[0];
  return (
    <>
      {open && (
        <PaintingSeriesPage
          isOwner={isOwner}
          seriesId={seriesId}
          seriesName={seriesName}
          pieces={ordered}
          username={username}
          selectedMedium={selectedMedium}
          onClose={() => setOpen(false)}
          onRefresh={onRefresh}
        />
      )}
      <div className="art-element">
        <div className="art-visual series-cover" onClick={() => setOpen(true)}>
          <ArtImage piece={cover} />
          <span className="series-badge">1/{ordered.length}</span>
        </div>
        <div className="art-right">
          <div className="art-details">
            <div className="art-details-header">
              <div className="art-details-title">{seriesName}</div>
              <BookmarkButton artIds={ordered.map((p) => p.id)} size={30} />
            </div>
            <div className="series-caption">series of {ordered.length}</div>
            {isOwner && (
              <button className="art-btn series-edit-btn" onClick={() => setOpen(true)}>edit</button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// The series as a full page: name (owner can rename), two-column grid in
// series order, tap a piece for the swipe viewer; owner ◀▶ reorder, per-piece
// edit / remove.
function PaintingSeriesPage({
  isOwner,
  seriesId,
  seriesName,
  pieces,
  username,
  selectedMedium,
  onClose,
  onRefresh,
}: {
  isOwner: boolean;
  seriesId: string;
  seriesName: string;
  pieces: SeriesPiece[];
  username: string;
  selectedMedium: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const { token } = useAuth()!;
  const [name, setName] = useState(seriesName);
  const [order, setOrder] = useState(pieces);
  useEffect(() => { setOrder(pieces); }, [pieces]);
  const [zoom, setZoom] = useState<number | null>(null);
  const [editing, setEditing] = useState<SeriesPiece | null>(null);
  const [pendingRemove, setPendingRemove] = useState<SeriesPiece | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const saveName = async () => {
    const t = name.trim();
    if (!t || t === seriesName) return;
    try { await rename_series(seriesId, t, token); onRefresh(); }
    catch (e) { alert((e as Error).message || "Could not rename"); }
  };

  const move = async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
    try { await set_series_order(seriesId, next.map((p) => p.id), token); onRefresh(); }
    catch { setOrder(order); }
  };

  const confirmRemove = async () => {
    const p = pendingRemove;
    setPendingRemove(null);
    if (!p) return;
    try { await remove_visual_2d(p.id, token); onRefresh(); }
    catch (e) { alert((e as Error).message || "Could not remove"); }
  };

  return (
    <div className="series-page">
      {zoom !== null && (
        <ArtCarousel
          slots={order.map((p) => ({ kind: "piece" as const, piece: p }))}
          initialIndex={zoom}
          creatorUsername={username}
          isOwner={isOwner}
          onClose={() => setZoom(null)}
        />
      )}
      {editing && (
        <AddArtDialog
          setShowDialog={() => setEditing(null)}
          selectedMedium={selectedMedium}
          username={username}
          onSuccess={onRefresh}
          piece={editing}
        />
      )}
      {pendingRemove && <ConfirmDialog onConfirm={confirmRemove} onCancel={() => setPendingRemove(null)} />}
      <div className="series-page-head">
        <button className="art-btn" onClick={onClose}>‹ back</button>
        {isOwner ? (
          <input className="series-page-name" value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} />
        ) : (
          <span className="series-page-name">{seriesName}</span>
        )}
      </div>
      <div className="series-grid">
        {order.map((p, i) => (
          <div key={p.id} className="series-cell">
            <div className="series-cell-img" onClick={() => setZoom(i)}>
              <ArtImage piece={p} sizes={GRID_SIZES} priority={i < 4} />
            </div>
            <div className="series-cell-title">{p.title}</div>
            {isOwner && (
              <div className="series-cell-btns">
                <button className="art-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label="move earlier">◀</button>
                <button className="art-btn" onClick={() => setEditing(p)}>edit</button>
                <button className="art-btn" onClick={() => setPendingRemove(p)}>remove</button>
                <button className="art-btn" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label="move later">▶</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
