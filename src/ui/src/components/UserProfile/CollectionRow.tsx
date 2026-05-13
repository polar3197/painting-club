import { useState } from "react";
import WrittenFormZoomIn from "../Utils/WrittenFormZoomIn";
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
            <WrittenFormZoomIn
                title={topPiece.title}
                filePath={topPiece.file_path}
                setIsZoomedIn={setIsZoomedIn}
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
        <div id={`collection-${collectionId}`} className="art-element written-form collection">
            <div className="art-visual" onClick={() => setIsZoomedIn(true)}>
                <div className="written-form-stack">
                    {/* Back layers peek out toward the top-left of the front tile —
                        the deeper a layer is in the stack, the further it shifts. */}
                    {Array.from({ length: stackLayers - 1 }).map((_, i) => {
                        const offset = (i + 1) * 4;
                        return (
                            <div
                                key={i}
                                className="written-form-stack-layer"
                                style={{ transform: `translate(${-offset}px, ${-offset}px)` }}
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
