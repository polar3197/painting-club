import { useState } from "react";
import { thumbUrl } from "../../api";
import "../../styles/utils/art-image.css";

/**
 * Progressive image: the 512px thumb paints immediately, the full-res original
 * fades in over the top once it loads. Eliminates the blank-tile flash while
 * still arriving at full quality.
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
  /** Fires when the thumb has loaded, with the aspect ratio. Useful for masonry sizing
   *  since thumbs paint much faster than full-res and share the same aspect. */
  onReady?: (aspectRatio: number) => void;
}) => {
  const [fullLoaded, setFullLoaded] = useState(false);

  return (
    <div className={`art-image ${className ?? ""}`}>
      <img
        className="art-image-thumb"
        src={thumbUrl(artId)}
        alt=""
        decoding="async"
        aria-hidden
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalHeight > 0) {
            onReady?.(img.naturalWidth / img.naturalHeight);
          }
        }}
      />
      <img
        className={`art-image-full ${fullLoaded ? "art-image-full--loaded" : ""}`}
        src={fullSrc}
        alt={alt}
        decoding="async"
        onLoad={() => setFullLoaded(true)}
      />
    </div>
  );
};

export default ArtImage;
