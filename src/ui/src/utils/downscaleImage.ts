// Client-side downscale for the application piece.
//
// This exists for UPLOAD SPEED, not for display: the preview renders from the
// local file and never waits on this. A 4MB camera JPEG over weak cell signal
// is ~30s; the same photo at 1600px is ~300KB and about two seconds. 1600 is
// DISPLAY_SIZE on the server — the size every art piece is reduced to for
// viewing anyway — so we hand the backend exactly what it would have produced.
//
// EXIF is the trap. Browsers apply orientation when rendering an <img>, but
// drawing to a canvas strips it, so a naive resize silently rotates iPhone
// photos sideways between the preview someone approved and the file we store.
// Both decode paths below preserve orientation.

export interface Downscaled {
  blob: Blob;
  width: number;
  height: number;
  aspectRatio: number;
}

const MAX_EDGE = 1600;
const QUALITY = 0.82;

interface Decoded {
  src: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

// Safari decodes HEIC natively; Chrome and Firefox don't. The app already
// carries heic2any for the painting upload (see PaintingForm.tsx), dynamically
// imported so it stays out of the main bundle and costs nothing unless a HEIC
// actually turns up.
function looksHeic(file: File): boolean {
  return /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

async function decode(file: File): Promise<Decoded> {
  try {
    return await decodeDirect(file);
  } catch (e) {
    if (!looksHeic(file)) throw e;
    const { default: heic2any } = await import("heic2any");
    const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    const blob = Array.isArray(converted) ? converted[0] : (converted as Blob);
    return decodeDirect(new File([blob], "converted.jpg", { type: "image/jpeg" }));
  }
}

async function decodeDirect(file: File): Promise<Decoded> {
  // Preferred: decodes off the main thread, and `from-image` is what actually
  // applies the EXIF rotation.
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { src: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close() };
    } catch {
      // Older Safari rejects the options bag — fall through.
    }
  }
  // Fallback: an <img> honours EXIF as it renders, so drawing that element to
  // the canvas keeps the orientation the person saw in their camera roll.
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("could not decode image"));
      img.src = url;
    });
    return {
      src: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

/** Downscale to <= MAX_EDGE on the long side, re-encoded as JPEG.
 *
 *  Throws only if every decode path fails, including the heic2any conversion.
 *  Callers should fall back to uploading the original rather than blocking the
 *  application — the server handles HEIC and resizes on its own side too. */
export async function downscaleImage(file: File): Promise<Downscaled> {
  const { src, width, height, release } = await decode(file);
  try {
    if (!width || !height) throw new Error("image has no dimensions");
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(src, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY),
    );
    if (!blob) throw new Error("could not encode image");
    return { blob, width: w, height: h, aspectRatio: w / h };
  } finally {
    release();
  }
}

/** A draft id is a filesystem path component on the server, which validates it
 *  against /^[A-Za-z0-9_-]{8,64}$/ — so generate one that shape. */
export function newDraftId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
