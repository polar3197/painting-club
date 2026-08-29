import { useState } from "react";
import ContextPopup from "./ContextPopup";
import "../../styles/utils/context-popup.css";

export interface KebabItem { label: string; onClick: () => void; destructive?: boolean }

// A quiet "⋯" that opens the app's context popup. Keeps edit/delete off the
// face of a page — same pattern the art viewer uses.
export default function KebabMenu({ items, label = "options", small = false }: { items: KebabItem[]; label?: string; small?: boolean }) {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  if (items.length === 0) return null;
  return (
    <>
      <button
        className={`kebab-btn ${small ? "kebab-btn-small" : ""}`}
        aria-label={label}
        onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setAnchor({ x: r.right - 180, y: r.bottom + 4 }); }}
      >⋯</button>
      <ContextPopup open={anchor !== null} anchor={anchor} onClose={() => setAnchor(null)}>
        {items.map((it) => (
          <button key={it.label} className={`context-popup-row ${it.destructive ? "context-popup-row-destructive" : ""}`}
            onClick={(e) => { e.stopPropagation(); setAnchor(null); it.onClick(); }}>
            {it.label}
          </button>
        ))}
      </ContextPopup>
    </>
  );
}
