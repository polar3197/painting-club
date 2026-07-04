import { useEffect, useState } from "react";
import AddArtDialog from "../Utils/AddArtDialog";
import ConfirmDialog from "../Utils/ConfirmDialog";
import { rename_series, remove_written_form, set_series_order, WrittenFormOut } from "../../api";

const CollectionPanel = ({
    pieces,
    seriesId,
    seriesName,
    username,
    selectedMedium,
    onClose,
    onRefresh,
}: {
    pieces: WrittenFormOut[];
    seriesId: string;
    seriesName: string;
    username: string;
    selectedMedium: string;
    onClose: () => void;
    onRefresh: () => void;
}) => {
    const [nameDraft, setNameDraft] = useState(seriesName);
    const [editing, setEditing] = useState<WrittenFormOut | null>(null);
    const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

    // Local order so drag-and-drop feels immediate; resync when the parent
    // hands us a fresh pieces list (after a refresh fires).
    const [order, setOrder] = useState<WrittenFormOut[]>(pieces);
    useEffect(() => { setOrder(pieces); }, [pieces]);
    const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
    const [overIdx, setOverIdx] = useState<number | null>(null);

    const token = localStorage.getItem("token");

    const saveName = async () => {
        const trimmed = nameDraft.trim();
        if (!trimmed || trimmed === seriesName) return;
        try {
            await rename_series(seriesId, trimmed, token);
            onRefresh();
        } catch (err: any) {
            alert(err?.message || "Could not rename series");
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

    const handleDrop = (idx: number) => {
        if (draggingIdx == null || draggingIdx === idx) {
            setDraggingIdx(null);
            setOverIdx(null);
            return;
        }
        const next = [...order];
        const [moved] = next.splice(draggingIdx, 1);
        next.splice(idx, 0, moved);
        setOrder(next);
        setDraggingIdx(null);
        setOverIdx(null);
        set_series_order(seriesId, next.map(p => p.id), token)
            .then(() => onRefresh())
            .catch((err: any) => alert(err?.message || "Could not save order"));
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
                        {order.length === 0 && (
                            <div className="collection-panel-empty">this series is empty</div>
                        )}
                        {order.map((p, idx) => {
                            const cls = [
                                "collection-panel-row",
                                draggingIdx === idx ? "dragging" : "",
                                overIdx === idx && draggingIdx !== idx ? "drop-target" : "",
                            ].filter(Boolean).join(" ");
                            return (
                                <div
                                    key={p.id}
                                    className={cls}
                                    draggable
                                    onDragStart={(e) => {
                                        setDraggingIdx(idx);
                                        e.dataTransfer.effectAllowed = "move";
                                    }}
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        setOverIdx(idx);
                                    }}
                                    onDrop={(e) => { e.preventDefault(); handleDrop(idx); }}
                                    onDragEnd={() => { setDraggingIdx(null); setOverIdx(null); }}
                                >
                                    <div className="collection-panel-drag-handle" aria-hidden>≡</div>
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
                            );
                        })}
                    </div>
                </div>
            </div>
        )}
        </>
    );
};

export default CollectionPanel;
