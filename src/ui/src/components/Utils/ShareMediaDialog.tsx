import { useState } from "react";
import "../../styles/utils/dialog.css";
import "../../styles/utils/share-media-dialog.css";

// Paper-plane action on one's own profile: a row per medium that copies that
// medium's portfolio link — the web counterpart of the iOS share sheet.
export default function ShareMediaDialog({ username, media, onClose }: {
  username: string;
  media: string[];
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  const linkFor = (medium: string) =>
    `${window.location.origin}/members/${username}/portfolio?medium=${encodeURIComponent(medium)}`;

  const copy = async (medium: string) => {
    const url = linkFor(medium);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(medium);
      setTimeout(() => setCopied((c) => (c === medium ? null : c)), 1800);
    } catch {
      // Clipboard blocked (http, permissions) — fall back to a prompt the
      // user can copy from by hand.
      window.prompt("copy this link", url);
    }
  };

  return (
    <div className="share-backdrop" onClick={onClose}>
      <div className="dialog share-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="exit"><button onClick={onClose}>x</button></div>
        <h2 className="share-title">share a portfolio</h2>
        {media.length === 0 ? (
          <p className="share-empty">no mediums to share yet</p>
        ) : (
          <div className="share-rows">
            {media.map((m) => (
              <div key={m} className="share-row">
                <span className="share-row-label">{m}</span>
                <button className="share-btn" onClick={() => copy(m)}>
                  {copied === m ? "copied" : "copy link"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
