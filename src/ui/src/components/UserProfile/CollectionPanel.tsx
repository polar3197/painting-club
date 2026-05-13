import { useState } from "react";
import AddArtDialog from "../Utils/AddArtDialog";
import ConfirmDialog from "../Utils/ConfirmDialog";
import { rename_collection, remove_written_form, WrittenFormOut } from "../../api";

const CollectionPanel = ({
    pieces,
    collectionId,
    collectionName,
    username,
    selectedMedium,
    onClose,
    onRefresh,
}: {
    pieces: WrittenFormOut[];
    collectionId: string;
    collectionName: string;
    username: string;
    selectedMedium: string;
    onClose: () => void;
    onRefresh: () => void;
}) => {
    const [nameDraft, setNameDraft] = useState(collectionName);
    const [editing, setEditing] = useState<WrittenFormOut | null>(null);
    const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

    const token = localStorage.getItem("token");

    const saveName = async () => {
        const trimmed = nameDraft.trim();
        if (!trimmed || trimmed === collectionName) return;
        try {
            await rename_collection(collectionId, trimmed, token);
            onRefresh();
        } catch (err: any) {
            alert(err?.message || "Could not rename collection");
        }
    };

    const confirmRemove = async () => {
        if (!pendingRemoveId) return;
        const id = pendingRemoveId;
        setPendingRemoveId(null);
        try {
            await remove_written_form(id, token);
            onRefresh();
        } catch (err: any) {
            alert(err?.message || "Could not remove piece");
        }
    };

    return (
        <>
        {editing && (
            <AddArtDialog
                setShowDialog={() => setEditing(null)}
                selectedMedium={selectedMedium}
                username={username}
                onSuccess={() => { setEditing(null); onRefresh(); }}
                writtenPiece={editing}
            />
        )}
        {pendingRemoveId && (
            <ConfirmDialog
                onConfirm={confirmRemove}
                onCancel={() => setPendingRemoveId(null)}
            />
        )}
        {!editing && !pendingRemoveId && (
            <div className="collection-panel-backdrop" onClick={onClose}>
                <div className="collection-panel" onClick={(e) => e.stopPropagation()}>
                    <div className="collection-panel-header">
                        <input
                            className="collection-panel-title"
                            value={nameDraft}
                            onChange={(e) => setNameDraft(e.target.value)}
                            onBlur={saveName}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        />
                        <button className="collection-panel-close" onClick={onClose}>x</button>
                    </div>
                    <div className="collection-panel-list">
                        {pieces.length === 0 && (
                            <div className="collection-panel-empty">this collection is empty</div>
                        )}
                        {pieces.map(p => (
                            <div key={p.id} className="collection-panel-row">
                                <div className="collection-panel-meta">
                                    <div className="collection-panel-row-title">{p.title}</div>
                                    {p.date && <div className="collection-panel-row-sub">{p.date}</div>}
                                    {p.keywords && p.keywords.length > 0 && (
                                        <div className="collection-panel-row-sub">{p.keywords.join(", ")}</div>
                                    )}
                                </div>
                                <div className="collection-panel-row-buttons">
                                    <button onClick={() => setEditing(p)}>edit</button>
                                    <button className="collection-panel-remove" onClick={() => setPendingRemoveId(p.id)}>remove</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}
        </>
    );
};

export default CollectionPanel;
