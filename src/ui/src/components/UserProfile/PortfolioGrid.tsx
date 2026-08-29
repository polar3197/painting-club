import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { get_members_visual_2d, Visual2DOut } from "../../api";
import { swr } from "../../cache";
import ArtZoomIn from "../Utils/ArtZoomIn";
import ArtImage from "../Utils/ArtImage";
import "../../styles/portfolio.css";

const ROW_SIZE = 1;  // matches grid-auto-rows in CSS
const GAP = 4;        // matches gap in CSS

const PortfolioCell = ({ piece, onClick }: { piece: Visual2DOut; onClick: () => void }) => {
  const cellRef = useRef<HTMLDivElement>(null);
  const [colSpan, setColSpan] = useState(1);
  const [rowSpan, setRowSpan] = useState(10);

  // Lay out from the canonical source aspect ratio (stored in DB at upload),
  // not from thumbnail pixel dimensions — those drift by PIL's rounding.
  useLayoutEffect(() => {
    const ratio = piece.aspect_ratio ?? 1;
    const grid = cellRef.current?.closest(".portfolio-grid") as HTMLElement | null;
    const gridWidth = grid?.clientWidth ?? 800;
    // Live column count from the grid so this follows the CSS media queries.
    const cols = grid
      ? getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length || 1
      : 4;
    const col = Math.min(ratio >= 1.6 ? 2 : 1, cols);
    const colWidth = (gridWidth - GAP * (cols - 1)) / cols;
    const cellWidth = colWidth * col + GAP * (col - 1);
    const cellHeight = cellWidth / ratio;
    setColSpan(col);
    setRowSpan(Math.ceil((cellHeight + GAP) / (ROW_SIZE + GAP)));
  }, [piece.aspect_ratio]);

  return (
    <div ref={cellRef} className="portfolio-cell" style={{ gridColumn: `span ${colSpan}`, gridRow: `span ${rowSpan}` }} onClick={onClick}>
      <ArtImage artId={piece.id} fullSrc={piece.file_path} alt={piece.title} />
      <div className="portfolio-cell-overlay">
        <p>{piece.title}</p>
        {piece.date && <p>{piece.date}</p>}
        {piece.height && piece.width && <p>{piece.width}"x{piece.height}"</p>}
      </div>
    </div>
  );
};

// A member's pieces in one medium as a tight masonry grid, optionally
// narrowed by keywords. Used inside the profile (portfolio toggle) and on the
// standalone portfolio page that share links point at.
export default function PortfolioGrid({ username, medium, keywords }: { username: string; medium: string; keywords: string[] }) {
  const [art, setArt] = useState<Visual2DOut[]>([]);
  const [zoomedImg, setZoomedImg] = useState<string | null>(null);
  const keywordsKey = keywords.join(",");

  useEffect(() => {
    let cancelled = false;
    swr(`art:${username}:${medium}`, () => get_members_visual_2d(username, medium), (data) => {
      if (cancelled) return;
      setArt(keywords.length > 0 ? data.filter((p) => keywords.every((k) => p.keywords?.includes(k))) : data);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [username, medium, keywordsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="portfolio-grid">
        {art.map((piece) => <PortfolioCell key={piece.id} piece={piece} onClick={() => setZoomedImg(piece.file_path)} />)}
      </div>
      {zoomedImg && <ArtZoomIn isOwner={false} imgPath={zoomedImg} setIsZoomedIn={() => setZoomedImg(null)} />}
    </>
  );
}
