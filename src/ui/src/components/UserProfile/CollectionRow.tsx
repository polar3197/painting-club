import { useState } from "react";
import CollectionZoomIn from "./CollectionZoomIn";
import CollectionPanel from "./CollectionPanel";
import { extFromPath, isTextExt, useWrittenFormText } from "../../hooks/useWrittenFormText";
import { WrittenFormOut } from "../../api";

const PREVIEW_LINES = 12;

function previewSnippet(text: string | null): string {
    if (text == null) return "";
    return text.split(/\r?\n/).slice(0, PREVIEW_LINES).join("\n");
}

// Sort pieces inside a collection oldest-first so the "top of the stack"
// (rendered last so it sits on top visually) is the most recent piece.
function sortPieces(pieces: WrittenFormOut[]): WrittenFormOut[] {
    return [...pieces].sort((a, b) => {
        const ad = a.date ?? "";
        const bd = b.date ?? "";
        if (ad === bd) return 0;
        return ad < bd ? -1 : 1;
    });
}

const CollectionRow = ({
    isOwner,
    pieces,
    collectionId,
    collectionName,
    username,
    selectedMedium,
    onRefresh,
}: {
    isOwner: boolean;
    pieces: WrittenFormOut[];
    collectionId: string;
    collectionName: string;
    username: string;
    selectedMedium: string;
    onRefresh: () => void;
}) => {
    const ordered = sortPieces(pieces);
    const topPiece = ordered[ordered.length - 1] ?? pieces[0];
    const [isZoomedIn, setIsZoomedIn] = useState(false);
    const [showPanel, setShowPanel] = useState(false);

    const ext = extFromPath(topPiece.file_path);
    const textContent = useWrittenFormText(topPiece.file_path);
    const snippet = previewSnippet(textContent);

    // Stack visual: render up to 3 offset paper layers behind the top one.
    const stackLayers = Math.min(ordered.length, 3);

    return (
        <>
        {isZoomedIn && (
            <CollectionZoomIn
                collectionName={collectionName}
                pieces={ordered}
                onClose={() => setIsZoomedIn(false)}
            />
        )}
        {showPanel && (
            <CollectionPanel
                pieces={ordered}
                collectionId={collectionId}
                collectionName={collectionName}
                username={username}
                selectedMedium={selectedMedium}
                onClose={() => setShowPanel(false)}
                onRefresh={onRefresh}
            />
        )}
        <div id={`collection-${collectionId}`} className="art-element written-form collection clickable" onClick={() => setIsZoomedIn(true)}>
            <div className="art-visual">
                <div className="written-form-stack">
                    {/* Back layers stay within the art-visual footprint by rotating
                        instead of translating — their corners peek behind the front
                        tile. Render deepest first so shallower layers paint over
                        them where they overlap. */}
                    {Array.from({ length: stackLayers - 1 }).map((_, i) => {
                        const depth = stackLayers - 1 - i; // i=0 → deepest
                        // Alternate left/right tilt so the stack reads as fanned, not curved.
                        const angle = depth === 1 ? 4 : depth === 2 ? -5 : 6;
                        return (
                            <div
                                key={depth}
                                className="written-form-stack-layer"
                                style={{ transform: `rotate(${angle}deg)` }}
                            />
                        );
                    })}
                    <div className="written-form-tile written-form-stack-top">
                        <div className="written-form-tile-badge">{ext.toUpperCase()}</div>
                        {isTextExt(ext) && snippet ? (
                            <pre className="written-form-tile-snippet">{snippet}</pre>
                        ) : (
                            <div className="written-form-tile-title">{topPiece.title}</div>
                        )}
                    </div>
                </div>
            </div>
            <div className="art-right">
                <div className="art-details">
                    <div className="art-details-header">
                        <div className="art-details-title">{collectionName}</div>
                        <div className="art-details-element">{ordered.length} piece{ordered.length === 1 ? "" : "s"}</div>
                    </div>
                </div>
                <div className="art-details-footer">
                    {isOwner && (
                        <div className="art-element-buttons">
                            <div className="edit">
                                <button onClick={(e) => { e.stopPropagation(); setShowPanel(true); }}>edit</button>
                            </div>
                            <div className="remove">
                                <button onClick={(e) => { e.stopPropagation(); setShowPanel(true); }}>remove</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
        </>
    );
};

export default CollectionRow;
