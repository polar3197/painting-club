import { useState } from "react";
import ConfirmDialog from "../Utils/ConfirmDialog";
import WrittenFormZoomIn from "../Utils/WrittenFormZoomIn";
import { extFromPath, isTextExt, useWrittenFormText } from "../../hooks/useWrittenFormText";
import { remove_written_form, WrittenFormOut } from "../../api";

const PREVIEW_LINES = 12;

function previewSnippet(text: string | null): string {
    if (text == null) return "";
    return text.split(/\r?\n/).slice(0, PREVIEW_LINES).join("\n");
}

const WrittenFormPiece = ({
    isOwner,
    piece,
    onRemove,
    onEdit,
}: {
    isOwner: boolean;
    piece: WrittenFormOut;
    viewerBlockedByOwner: boolean;
    onRemove: () => void;
    onEdit: () => void;
}) => {
    const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
    const [isZoomedIn, setIsZoomedIn] = useState(false);

    const ext = extFromPath(piece.file_path);
    const textContent = useWrittenFormText(piece.file_path);
    const snippet = previewSnippet(textContent);

    const removePiece = async () => {
        await remove_written_form(piece.id, localStorage.getItem("token"));
        setShowRemoveConfirm(false);
        onRemove();
    };

    return (
        <>
        {isZoomedIn && (
            <WrittenFormZoomIn
                title={piece.title}
                filePath={piece.file_path}
                setIsZoomedIn={setIsZoomedIn}
            />
        )}
        {showRemoveConfirm &&
            <ConfirmDialog
                onConfirm={removePiece}
                onCancel={() => setShowRemoveConfirm(false)}
            />
        }
        <div id={`art-${piece.id}`} className="art-element written-form">
            <div className="art-visual" onClick={() => setIsZoomedIn(true)}>
                <div className="written-form-tile">
                    <div className="written-form-tile-badge">{ext.toUpperCase()}</div>
                    {isTextExt(ext) && snippet ? (
                        <pre className="written-form-tile-snippet">{snippet}</pre>
                    ) : (
                        <div className="written-form-tile-title">{piece.title}</div>
                    )}
                </div>
            </div>
            <div className="art-right">
                <div className="art-details">
                    <div className="art-details-header">
                        <div className="art-details-title">{piece.title}</div>
                        {piece.date && <div className="art-details-element">{piece.date}</div>}
                    </div>
                    <div className="art-details-elements">
                        {piece.keywords && piece.keywords.length > 0 && (
                            <div className="art-details-element"><b>keywords: </b>{piece.keywords.join(", ")}</div>
                        )}
                    </div>
                </div>
                <div className="art-details-footer">
                    {isOwner && (
                        <div className="art-element-buttons">
                            <div className="edit">
                                <button onClick={(e) => { e.stopPropagation(); onEdit(); }}>edit</button>
                            </div>
                            <div className="remove">
                                <button onClick={(e) => { e.stopPropagation(); setShowRemoveConfirm(true); }}>remove</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
        </>
    );
};

export default WrittenFormPiece;
