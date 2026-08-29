import { useEffect, useState } from "react";
import { thumbUrl } from "../../api";
import { loadedImages } from "../../cache";

/**
 * Progressive <img>: starts with the 512px thumb for instant paint, then swaps its
 * src to the full-res original once it finishes preloading in the background.
 * Deliberately renders a bare <img> (no wrapper div, no extra CSS) so site-specific
 * selectors like `.portfolio-cell img`, `.art-card-img img`, `.art-visual img` size
 * and style it exactly as they did before thumbnails were introduced.
 *
 * Once a full-res image has loaded it's remembered (cache.ts), so remounting —
 * every page switch — renders the full image straight away instead of
 * flashing the thumb and re-swapping.
 */
const ArtImage = ({
  artId,
  fullSrc,
  alt,
  className,
}: {
  artId: string;
  fullSrc: string;
  alt: string;
  className?: string;
}) => {
  const [src, setSrc] = useState(() => (loadedImages.has(fullSrc) ? fullSrc : thumbUrl(artId)));

  useEffect(() => {
    if (loadedImages.has(fullSrc)) { setSrc(fullSrc); return; }
    setSrc(thumbUrl(artId));
    let cancelled = false;
    const full = new Image();
    full.onload = () => { loadedImages.add(fullSrc); if (!cancelled) setSrc(fullSrc); };
    full.src = fullSrc;
    return () => { cancelled = true; };
  }, [artId, fullSrc]);

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      decoding="async"
    />
  );
};

export default ArtImage;
