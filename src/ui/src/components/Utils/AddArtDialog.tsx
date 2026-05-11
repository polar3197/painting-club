
import { Dispatch, SetStateAction, useEffect, useState } from "react";

import PaintingForm from "../Utils/PaintingForm";
import "../../styles/utils/dialog.css";
import { update_visual_2d, Visual2DOut, Visual2DIn, get_media, MediaType } from "../../api";

// this element will be z= 100 and centered relative to the whole page
const AddArtDialog = ({ setShowDialog, selectedMedium, username, onSuccess, onMoved, piece, onCreate }
    : {
        setShowDialog : Dispatch<SetStateAction<boolean>>;
        selectedMedium : string;
        username : string;
        onSuccess: () => void;
        onMoved?: (newMedium: string) => void;
        piece?: Visual2DOut;
        // Parent owns the upload + placeholder tile when supplied.
        onCreate?: (payload: Visual2DIn) => void;
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
        } : null
    );

    const [allMedia, setAllMedia] = useState<MediaType[]>([]);
    const [newMedium, setNewMedium] = useState<string>("");

    useEffect(() => {
        get_media().then(setAllMedia).catch(() => {});
    }, []);

    const currentType = allMedia.find(m => m.name === selectedMedium)?.type ?? null;
    const isVisual2D = currentType === "visual_2d";
    const compatibleMedia = piece && currentType
        ? allMedia.filter(m => m.type === currentType && m.name !== selectedMedium)
        : [];

    const submit = () => {
        if (!formData || !isVisual2D) return;
        const token = localStorage.getItem("token");

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
            const createPayload: Visual2DIn = {
                username,
                medium: selectedMedium,
                title: formData.title,
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
                <button onClick={() => submit()}>{piece ? "update" : "submit"}</button>
            </div>
            {isVisual2D && <PaintingForm onDataChange={setFormData} initialData={piece} />}
            {piece && compatibleMedia.length > 0 && (
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
