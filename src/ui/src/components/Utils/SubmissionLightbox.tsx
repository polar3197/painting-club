import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArtResult } from "../../api";
import ArtImage from "./ArtImage";
import "../../styles/utils/lightbox.css";

// Zoomed view of one submission with ← → (keys or the on-screen arrows) to
// move through the rest. Esc / backdrop closes.
export default function SubmissionLightbox({ pieces, index, onIndex, onClose }: {
  pieces: ArtResult[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const piece = pieces[index];
  const prev = () => onIndex((index - 1 + pieces.length) % pieces.length);
  const next = () => onIndex((index + 1) % pieces.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Warm the neighbours so arrowing feels instant.
  useEffect(() => {
    for (const i of [index - 1, index + 1]) {
      const p = pieces[(i + pieces.length) % pieces.length];
      if (p) { const img = new Image(); img.src = p.file_path; }
    }
  }, [index, pieces]);

  if (!piece) return null;
  const many = pieces.length > 1;

  return (
    <div className="lb-backdrop" onClick={onClose}>
      {many && <button className="lb-arrow lb-prev" aria-label="previous" onClick={(e) => { e.stopPropagation(); prev(); }}>‹</button>}
      <figure className="lb-figure" onClick={(e) => e.stopPropagation()}>
        <ArtImage artId={piece.id} fullSrc={piece.file_path} alt={piece.title} className="lb-img" />
        <figcaption className="lb-caption">
          <span className="lb-title">{piece.title}</span>
          <button className="lb-creator" onClick={() => navigate(`/members/${piece.creator_username}/profile?artId=${piece.id}&medium=${encodeURIComponent(piece.medium)}`)}>
            @{piece.creator_username} ›
          </button>
          {many && <span className="lb-count">{index + 1} / {pieces.length}</span>}
        </figcaption>
      </figure>
      {many && <button className="lb-arrow lb-next" aria-label="next" onClick={(e) => { e.stopPropagation(); next(); }}>›</button>}
      <button className="lb-close" aria-label="close" onClick={onClose}>x</button>
    </div>
  );
}
