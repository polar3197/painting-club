import { useState } from "react";
import ConfirmDialog from "../Utils/ConfirmDialog";
import { remove_written_form, WrittenFormOut } from "../../api";

function extFromPath(path: string): string {
    const m = path.toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1].toUpperCase() : "FILE";
}

const WrittenFormPiece = ({
    isOwner,
    piece,
    onRemove,
}: {
    isOwner: boolean;
    piece: WrittenFormOut;
    viewerBlockedByOwner: boolean;
    onRemove: () => void;
}) => {
    const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

    const ext = extFromPath(piece.file_path);

    const removePiece = async () => {
        await remove_written_form(piece.id, localStorage.getItem("token"));
        setShowRemoveConfirm(false);
        onRemove();
    };

    return (
        <>
        {showRemoveConfirm &&
            <ConfirmDialog
                onConfirm={removePiece}
                onCancel={() => setShowRemoveConfirm(false)}
            />
        }
        <div id={`art-${piece.id}`} className="art-element written-form">
            <div className="art-visual" onClick={() => window.open(piece.file_path, "_blank", "noopener,noreferrer")}>
                <div className="written-form-tile">
                    <div className="written-form-tile-badge">{ext}</div>
                    <div className="written-form-tile-title">{piece.title}</div>
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
                            <div className="remove">
                                <button onClick={() => setShowRemoveConfirm(true)}>remove</button>
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
