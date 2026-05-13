
import { Dispatch, SetStateAction, useEffect, useState } from "react";

import PaintingForm from "../Utils/PaintingForm";
import WrittenFormForm from "../Utils/WrittenFormForm";
import "../../styles/utils/dialog.css";
import { update_visual_2d, update_written_form, Visual2DOut, Visual2DIn, WrittenFormOut, WrittenFormIn, get_media, MediaType } from "../../api";

// this element will be z= 100 and centered relative to the whole page
const AddArtDialog = ({ setShowDialog, selectedMedium, username, onSuccess, onMoved, piece, writtenPiece, onCreate, onCreateWrittenForm }
    : {
        setShowDialog : Dispatch<SetStateAction<boolean>>;
        selectedMedium : string;
        username : string;
        onSuccess: () => void;
        onMoved?: (newMedium: string) => void;
        piece?: Visual2DOut;
        writtenPiece?: WrittenFormOut;
        // Parent owns the upload + placeholder tile when supplied.
        onCreate?: (payload: Visual2DIn) => void;
        onCreateWrittenForm?: (payload: WrittenFormIn) => void;
    }
) => {
    const [formData, setFormData] = useState<Record<string, any> | null>(
        piece ? {
            title: piece.title ?? "",
            location: piece.location ?? "",
            date: piece.date ?? "",
            song: piece.song ?? "",
            song_artist: piece.song_artist ?? "",
            width: piece.width ?? null,
            height: piece.height ?? null,
            keywords: piece.keywords?.join(", ") ?? "",
            comments_enabled: piece.comments_enabled ?? false,
            files: null,
        } : writtenPiece ? {
            title: writtenPiece.title ?? "",
            date: writtenPiece.date ?? "",
            keywords: writtenPiece.keywords?.join(", ") ?? "",
            comments_enabled: writtenPiece.comments_enabled ?? false,
            files: null,
        } : null
    );

    const [allMedia, setAllMedia] = useState<MediaType[]>([]);
    const [newMedium, setNewMedium] = useState<string>("");

    useEffect(() => {
        get_media().then(setAllMedia).catch(() => {});
    }, []);

    const currentType = allMedia.find(m => m.name === selectedMedium)?.type ?? null;
    const isVisual2D = currentType === "visual_2d";
    const isWrittenForm = currentType === "written_form";
    const editing = piece || writtenPiece;
    const compatibleMedia = editing && currentType
        ? allMedia.filter(m => m.type === currentType && m.name !== selectedMedium)
        : [];

    const submit = () => {
        if (!formData) return;
        const token = localStorage.getItem("token");

        if (isWrittenForm) {
            const title = (formData.title || "").trim();
            if (!title) { alert("Please enter a title."); return; }

            if (writtenPiece) {
                const moving = newMedium && newMedium !== selectedMedium ? newMedium : null;
                const collectionRaw = (formData.collection ?? "").trim();
                const updatePayload = {
                    title,
                    date: formData.date || null,
                    keywords: formData.keywords ? formData.keywords.split(",").map((k: string) => k.trim()).filter(Boolean) : null,
                    comments_enabled: formData.comments_enabled,
                    medium: moving,
                    collection_name: collectionRaw || null,
                    clear_collection: !!writtenPiece.collection_id && collectionRaw === "",
                };
                setShowDialog(false);
                update_written_form(writtenPiece.id, token, updatePayload)
                    .then(() => {
                        if (moving && onMoved) onMoved(moving);
                        onSuccess();
                    })
                    .catch((err: any) => alert(err?.message || "Something went wrong"));
                return;
            }

            if (!formData.files) { alert("Please select a file."); return; }
            const createPayload: WrittenFormIn = {
                username,
                medium: selectedMedium,
                title,
                date: formData.date,
                keywords: formData.keywords,
                collection_name: (formData.collection ?? "").trim() || undefined,
                comments_enabled: formData.comments_enabled,
                file: formData.files,
            };
            setShowDialog(false);
            onCreateWrittenForm?.(createPayload);
            return;
        }

        if (!isVisual2D) return;

        if (piece) {
            const moving = newMedium && newMedium !== selectedMedium ? newMedium : null;
            const updatePayload = {
                title: formData.title,
                location: formData.location,
                song: formData.song,
                song_artist: formData.song_artist,
                date: formData.date || null,
                width: formData.width,
                height: formData.height,
                keywords: formData.keywords ? formData.keywords.split(",").map((k: string) => k.trim()).filter(Boolean) : null,
                comments_enabled: formData.comments_enabled,
                medium: moving,
            };
            setShowDialog(false);
            update_visual_2d(piece.id, token, updatePayload)
                .then(() => {
                    if (moving && onMoved) onMoved(moving);
                    onSuccess();
                })
                .catch((err: any) => alert(err?.message || "Something went wrong"));
        } else {
            if (!formData.files) {
                alert("Please select an image.");
                return;
            }
            const title = (formData.title || "").trim();
            if (!title) {
                alert("Please enter a title.");
                return;
            }
            const createPayload: Visual2DIn = {
                username,
                medium: selectedMedium,
                title,
                location: formData.location,
                song: formData.song,
                song_artist: formData.song_artist,
                date: formData.date,
                width: formData.width,
                height: formData.height,
                keywords: formData.keywords,
                comments_enabled: formData.comments_enabled,
                file: formData.files,
            };
            setShowDialog(false);
            onCreate?.(createPayload);
        }
    };

    return (
        <div className="dialog">
            <div className="exit">
                <button onClick={() => setShowDialog(false)}>x</button>
            </div>
            <div className="submit">
                <button onClick={() => submit()}>{editing ? "update" : "submit"}</button>
            </div>
            {isVisual2D && <PaintingForm onDataChange={setFormData} initialData={piece} />}
            {isWrittenForm && <WrittenFormForm onDataChange={setFormData} initialData={writtenPiece} />}
            {editing && compatibleMedia.length > 0 && (
                <div style={{ position: "absolute", bottom: 35, left: 20, display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ fontFamily: "'Times New Roman', Times, serif" }}>move to:</label>
                    <select
                        value={newMedium}
                        onChange={(e) => setNewMedium(e.target.value)}
                        style={{ fontFamily: "'Times New Roman', Times, serif", padding: "2px 6px" }}
                    >
                        <option value="">{selectedMedium}</option>
                        {compatibleMedia.map(m => (
                            <option key={m.id} value={m.name}>{m.name}</option>
                        ))}
                    </select>
                </div>
            )}
        </div>
    )
}

export default AddArtDialog;
