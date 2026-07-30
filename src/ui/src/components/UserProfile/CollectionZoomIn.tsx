import { useEffect, useState } from "react";
import WrittenFormZoomIn from "../Utils/WrittenFormZoomIn";
import { extFromPath, isTextExt, useWrittenFormText } from "../../hooks/useWrittenFormText";
import { WrittenFormOut } from "../../api";

const PREVIEW_LINES = 16;

function previewSnippet(text: string | null): string {
    if (text == null) return "";
    return text.split(/\r?\n/).slice(0, PREVIEW_LINES).join("\n");
}

const ThumbCell = ({ piece, onClick }: { piece: WrittenFormOut; onClick: () => void }) => {
    const ext = extFromPath(piece.file_path);
    const text = useWrittenFormText(piece.file_path);
    const snippet = previewSnippet(text);
    return (
        <div className="collection-zoom-cell" onClick={onClick}>
            <div className="written-form-tile collection-zoom-tile" style={piece.cover_image_path ? { position: "relative", padding: 0 } : undefined}>
                {piece.cover_image_path ? (
                    <img
                        src={piece.cover_image_path}
                        alt={piece.title}
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                    />
                ) : (
                    <>
                        <div className="written-form-tile-badge">{ext.toUpperCase()}</div>
                        {isTextExt(ext) && snippet ? (
                            <pre className="written-form-tile-snippet">{snippet}</pre>
                        ) : (
                            <div className="written-form-tile-title">{piece.title}</div>
                        )}
                    </>
                )}
            </div>
            <div className="collection-zoom-cell-title">{piece.title}</div>
        </div>
    );
};

const CollectionZoomIn = ({
    seriesName,
    pieces,
    onClose,
}: {
    seriesName: string;
    pieces: WrittenFormOut[];
    onClose: () => void;
}) => {
    const [focused, setFocused] = useState<WrittenFormOut | null>(null);

    useEffect(() => {
        if (focused) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose, focused]);

    if (focused) {
        return (
            <WrittenFormZoomIn
                title={focused.title}
                filePath={focused.file_path}
                setIsZoomedIn={() => setFocused(null)}
            />
        );
    }

    return (
        <div className="collection-zoom-backdrop" onClick={onClose}>
            <div className="collection-zoom-panel" onClick={(e) => e.stopPropagation()}>
                <div className="collection-zoom-header">
                    <div className="collection-zoom-title">{seriesName}</div>
                    <button className="collection-zoom-close" onClick={onClose}>x</button>
                </div>
                <div className="collection-zoom-grid">
                    {pieces.map(p => <ThumbCell key={p.id} piece={p} onClick={() => setFocused(p)} />)}
                </div>
            </div>
        </div>
    );
};

export default CollectionZoomIn;
