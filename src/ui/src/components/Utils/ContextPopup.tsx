import { ReactNode, useEffect, useState } from "react";
import "../../styles/utils/context-popup.css";

interface Props {
    open: boolean;
    anchor: { x: number; y: number } | null;
    onClose: () => void;
    children: ReactNode;
    width?: number;
}

const DEFAULT_W = 200;
const ESTIMATED_H = 100;
const EDGE_PADDING = 8;

export default function ContextPopup({ open, anchor, onClose, children, width = DEFAULT_W }: Props) {
    const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
    useEffect(() => {
        const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open || !anchor) return null;

    const left = Math.min(Math.max(anchor.x, EDGE_PADDING), vp.w - width - EDGE_PADDING);
    const top = Math.min(Math.max(anchor.y, EDGE_PADDING), vp.h - ESTIMATED_H - EDGE_PADDING);

    return (
        <div className="context-popup-backdrop" onClick={onClose}>
            <div
                className="context-popup"
                style={{ left, top, width }}
                onClick={(e) => e.stopPropagation()}
            >
                {children}
            </div>
        </div>
    );
}
