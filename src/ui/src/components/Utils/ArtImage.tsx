import { useEffect, useRef, useState } from "react";
import { thumbUrl } from "../../api";

/**
 * Progressive <img>: starts with the 512px thumb for instant paint, then swaps its
 * src to the full-res original once it finishes preloading in the background.
 * Deliberately renders a bare <img> (no wrapper div, no extra CSS) so site-specific
 * selectors like `.portfolio-cell img`, `.art-card-img img`, `.art-visual img` size
 * and style it exactly as they did before thumbnails were introduced.
 */
const ArtImage = ({
  artId,
  fullSrc,
  alt,
  className,
  onReady,
}: {
  artId: string;
  fullSrc: string;
  alt: string;
  className?: string;
  /** Fires once per piece, with the intrinsic aspect ratio. */
  onReady?: (aspectRatio: number) => void;
}) => {
  const [src, setSrc] = useState(thumbUrl(artId));
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;
    setSrc(thumbUrl(artId));
    const full = new Image();
    full.onload = () => setSrc(fullSrc);
    full.src = fullSrc;
  }, [artId, fullSrc]);

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      decoding="async"
      onLoad={(e) => {
        const img = e.currentTarget;
        if (!firedRef.current && img.naturalHeight > 0) {
          firedRef.current = true;
          onReady?.(img.naturalWidth / img.naturalHeight);
        }
      }}
    />
  );
};

export default ArtImage;
