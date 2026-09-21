import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import ArtImage, { ArtImagePiece } from "./ArtImage";
import ReportDialog from "./ReportDialog";
import "../../styles/utils/art-carousel.css";

// A slot the viewer swipes between: one piece, or a series shown as a single
// slot that scrolls vertically through its pieces (the iOS ArtCarousel model).
export type CarouselSlot =
  | { kind: "piece"; piece: ArtImagePiece }
  | { kind: "collection"; pieces: ArtImagePiece[] };

/**
 * Full-screen viewer over a profile's pieces: swipe left/right between slots
 * (CSS scroll-snap), up/down inside a series slot, cream caption bar with the
 * title and creator, ⋮ to report someone else's piece. Pinch-zoom is the
 * browser's own. Esc / × / tapping the dark margin closes.
 */
export default function ArtCarousel({
  slots,
  initialIndex,
  creatorUsername,
  isOwner,
  onClose,
}: {
  slots: CarouselSlot[];
  initialIndex: number;
  creatorUsername: string;
  isOwner: boolean;
  onClose: () => void;
}) {
  const auth = useAuth();
  const rowRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(initialIndex);
  const [inner, setInner] = useState<Record<number, number>>({});
  const [reporting, setReporting] = useState<string | null>(null);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (row) row.scrollLeft = initialIndex * row.clientWidth;
  }, [initialIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      const row = rowRef.current;
      if (!row) return;
      if (e.key === "ArrowRight") row.scrollBy({ left: row.clientWidth, behavior: "smooth" });
      if (e.key === "ArrowLeft") row.scrollBy({ left: -row.clientWidth, behavior: "smooth" });
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const onRowScroll = () => {
    const row = rowRef.current;
    if (row && row.clientWidth) setIndex(Math.round(row.scrollLeft / row.clientWidth));
  };

  const slot = slots[index];
  const current: ArtImagePiece | undefined =
    slot?.kind === "piece" ? slot.piece : slot?.pieces[inner[index] ?? 0];
  const canReport = !isOwner && !!auth?.currentUser && !!current;

  return (
    <div className="carousel-backdrop" role="dialog" aria-modal="true">
      <button className="carousel-close" aria-label="close" onClick={onClose}>×</button>
      {canReport && (
        <button className="carousel-kebab" aria-label="report" onClick={() => setReporting(current!.id)}>⋮</button>
      )}
      <div className="carousel-row" ref={rowRef} onScroll={onRowScroll}>
        {slots.map((s, i) => (
          <div key={i} className="carousel-slot" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            {s.kind === "piece" ? (
              <div className="carousel-frame" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
                <ArtImage piece={s.piece} sizes="100vw" priority={Math.abs(i - initialIndex) <= 1} className="carousel-img" />
              </div>
            ) : (
              <div
                className="carousel-column"
                onScroll={(e) => {
                  const el = e.currentTarget;
                  const n = Math.round(el.scrollTop / el.clientHeight);
                  setInner((m) => (m[i] === n ? m : { ...m, [i]: n }));
                }}
              >
                {s.pieces.map((p, j) => (
                  <div key={p.id} className="carousel-frame">
                    <ArtImage piece={p} sizes="100vw" priority={i === initialIndex && j === 0} className="carousel-img" />
                  </div>
                ))}
                <span className="carousel-count">{(inner[i] ?? 0) + 1}/{s.pieces.length}</span>
              </div>
            )}
          </div>
        ))}
      </div>
      {current && (
        <div className="carousel-caption">
          <b>{current.title}</b> <span>@{creatorUsername}</span>
        </div>
      )}
      {reporting && (
        <ReportDialog open targetType="art" targetId={reporting} onClose={() => setReporting(null)} />
      )}
    </div>
  );
}
