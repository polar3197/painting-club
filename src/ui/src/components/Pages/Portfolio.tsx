import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { get_members_visual_2d, Visual2DOut } from "../../api";
import { useProfile } from "../../hooks/useProfile";
import { swr } from "../../cache";
import ArtZoomIn from "../Utils/ArtZoomIn";
import ArtImage from "../Utils/ArtImage";
import "../../styles/portfolio.css";

const ROW_SIZE = 1;  // matches grid-auto-rows in CSS
const GAP = 4;        // matches gap in CSS

const PortfolioCell = ({
  piece,
  onClick,
}: {
  piece: Visual2DOut;
  onClick: () => void;
}) => {
  const cellRef = useRef<HTMLDivElement>(null);
  const [colSpan, setColSpan] = useState(1);
  const [rowSpan, setRowSpan] = useState(10);

  // Lay out from canonical source aspect ratio (stored in DB at upload), not from
  // thumbnail pixel dimensions — those drift from the source by PIL's integer rounding.
  useLayoutEffect(() => {
    const ratio = piece.aspect_ratio ?? 1;
    const grid = cellRef.current?.closest(".portfolio-grid") as HTMLElement | null;
    const gridWidth = grid?.clientWidth ?? 800;
    // Read live column count from the grid so this stays in sync with the CSS media queries
    // (4 cols desktop / 3 ≤1024px / 2 ≤640px) instead of hardcoding a value that breaks on mobile.
    const cols = grid
      ? getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length || 1
      : 4;
    const col = Math.min(ratio >= 1.6 ? 2 : 1, cols);
    const colWidth = (gridWidth - GAP * (cols - 1)) / cols;
    const cellWidth = colWidth * col + GAP * (col - 1);
    const cellHeight = cellWidth / ratio;
    const row = Math.ceil((cellHeight + GAP) / (ROW_SIZE + GAP));

    setColSpan(col);
    setRowSpan(row);
  }, [piece.aspect_ratio]);

  return (
    <div
      ref={cellRef}
      className="portfolio-cell"
      style={{ gridColumn: `span ${colSpan}`, gridRow: `span ${rowSpan}` }}
      onClick={onClick}
    >
      <ArtImage artId={piece.id} fullSrc={piece.file_path} alt={piece.title} />
      <div className="portfolio-cell-overlay">
        <p>{piece.title}</p>
        {piece.date && <p>{piece.date}</p>}
        {piece.height && piece.width && <p>{piece.width}"x{piece.height}"</p>}
      </div>
    </div>
  );
};

const Portfolio = () => {
  const { username } = useParams<{ username: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const medium = searchParams.get("medium") ?? "";
  const keywordsParam = searchParams.get("keywords");
  const keywords = keywordsParam ? keywordsParam.split(",").filter(Boolean) : [];

  const [profile] = useProfile(username);
  const [art, setArt] = useState<Visual2DOut[]>([]);
  const [zoomedImg, setZoomedImg] = useState<string | null>(null);

  useEffect(() => {
    if (!username || !medium) return;
    swr(`art:${username}:${medium}`, () => get_members_visual_2d(username, medium), (data) => {
      const filtered =
        keywords.length > 0
          ? data.filter((p) => keywords.every((k) => p.keywords?.includes(k)))
          : data;
      setArt(filtered);
    }).catch(() => {});
  }, [username, medium, keywordsParam]);

  const headerParts = [medium, ...keywords].filter(Boolean);

  return (
    <div className="portfolio-page">
      <div className="portfolio-header">
        <span className="portfolio-artist">
          {profile ? `${profile.firstname} ${profile.lastname}` : `@${username}`}
        </span>
        {headerParts.length > 0 && (
          <span className="portfolio-tags">{headerParts.join(" · ")}</span>
        )}
        <div
          className="portfolio-view-toggle"
          onClick={() => navigate(`/members/${username}/profile`)}
        >
          profile view
        </div>
      </div>
      <div className="portfolio-grid">
        {art.map((piece) => (
          <PortfolioCell
            key={piece.id}
            piece={piece}
            onClick={() => setZoomedImg(piece.file_path)}
          />
        ))}
      </div>
      {zoomedImg && (
        <ArtZoomIn
          isOwner={false}
          imgPath={zoomedImg}
          setIsZoomedIn={() => setZoomedImg(null)}
        />
      )}
    </div>
  );
};

export default Portfolio;
