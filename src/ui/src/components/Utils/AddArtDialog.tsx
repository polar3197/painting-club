
import { Dispatch, SetStateAction, useEffect, useState } from "react";

import PaintingForm from "../Utils/PaintingForm";
import "../../styles/utils/dialog.css";
import { add_new_visual_2d, update_visual_2d, Visual2DOut, get_media, MediaType } from "../../api";

const isVisual2D = (medium: string) =>
    medium == "drawing" || medium == "painting" || medium == "stained glass" || medium == "photography";

// this element will be z= 100 and centered relative to the whole page
const AddArtDialog = ({ setShowDialog, selectedMedium, username, onSuccess, onMoved, piece }
    : {
        setShowDialog : Dispatch<SetStateAction<boolean>>;
        selectedMedium : string;
        username : string;
        onSuccess: () => void;
        onMoved?: (newMedium: string) => void;
        piece?: Visual2DOut;
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
        if (!piece) return;
        get_media().then(setAllMedia).catch(() => {});
    }, [piece]);

    const currentType = allMedia.find(m => m.name === selectedMedium)?.type ?? null;
    const compatibleMedia = piece && currentType
        ? allMedia.filter(m => m.type === currentType && m.name !== selectedMedium)
        : [];

    const submit = async () => {
        if (!formData) return;
        const token = localStorage.getItem("token");

        if (isVisual2D(selectedMedium)) {
            if (piece) {
                const moving = newMedium && newMedium !== selectedMedium ? newMedium : null;
                await update_visual_2d(piece.id, token, {
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
                });
                if (moving && onMoved) onMoved(moving);
            } else {
                if (!formData.files) {
                    alert("Please select an image.");
                    return;
                }
                await add_new_visual_2d(token, {
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
                });
            }
        }

        setShowDialog(false);
        onSuccess();
    };

    return (
        <div className="dialog">
            <div className="exit">
                <button onClick={() => setShowDialog(false)}>x</button>
            </div>
            <div className="submit">
                <button onClick={() => submit()}>{piece ? "update" : "submit"}</button>
            </div>
            {isVisual2D(selectedMedium) && <PaintingForm onDataChange={setFormData} initialData={piece} />}
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
