import { useState } from "react";

/**
 * One <img> per piece, sized to its box. The browser picks between the signed
 * 512px thumb and ~1600px display copy via srcset/sizes, so it downloads roughly
 * what it can show (progressive JPEGs — no top-to-bottom paint) and never the
 * multi-MB original; that's only fetched by the zoom view. Before the bytes
 * land, the box is already the piece's shape (aspect_ratio from the DB) with a
 * faint tint, so nothing collapses or jumps.
 *
 * Still renders a bare <img> (no wrapper) so site-specific selectors like
 * `.portfolio-cell img`, `.art-card-img img`, `.art-visual img` size it.
 */
export type ArtImagePiece = {
  id: string;
  title: string;
  file_path: string;
  aspect_ratio?: number | null;
  thumb_url?: string | null;
  display_url?: string | null;
};

// Grid cells rarely exceed a fifth of the viewport on desktop / half on phones.
export const GRID_SIZES = "(max-width: 640px) 50vw, 20vw";

const ArtImage = ({
  piece,
  sizes = "(max-width: 640px) 100vw, 40vw",  // profile .art-visual
  priority = false,
  className,
}: {
  piece: ArtImagePiece;
  /** CSS width the image renders at, for srcset selection. */
  sizes?: string;
  /** Above-the-fold: fetch first. Otherwise lazy-load near the viewport. */
  priority?: boolean;
  className?: string;
}) => {
  const { thumb_url, display_url, aspect_ratio } = piece;
  const [loaded, setLoaded] = useState(false);
  // Derivatives are None until generated (brand-new upload) — fall back to the original.
  const src = display_url || thumb_url || piece.file_path;
  const srcSet = thumb_url && display_url ? `${thumb_url} 512w, ${display_url} 1600w` : undefined;

  return (
    <img
      // srcSet/sizes before src so no browser starts fetching `src` first.
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      src={src}
      alt={piece.title}
      className={className}
      decoding="async"
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      onLoad={() => setLoaded(true)}
      style={{
        aspectRatio: aspect_ratio ? String(aspect_ratio) : undefined,
        // Tint only the empty box; once painted, the site CSS background applies.
        backgroundColor: loaded ? undefined : "rgba(0, 0, 0, 0.06)",
      }}
    />
  );
};

export default ArtImage;
