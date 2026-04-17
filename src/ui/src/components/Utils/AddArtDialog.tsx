
import { Dispatch, SetStateAction, useState } from "react";

import PaintingForm from "../Utils/PaintingForm";
import "../../styles/utils/dialog.css";
import { add_new_visual_2d, update_visual_2d, Visual2DOut } from "../../api";

const isVisual2D = (medium: string) =>
    medium == "drawing" || medium == "painting" || medium == "stained glass" || medium == "photography";

// this element will be z= 100 and centered relative to the whole page
const AddArtDialog = ({ setShowDialog, selectedMedium, username, onSuccess, piece }
    : { setShowDialog : Dispatch<SetStateAction<boolean>>; selectedMedium : string; username : string; onSuccess: () => void; piece?: Visual2DOut; }
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

    const submit = async () => {
        if (!formData) return;
        const token = localStorage.getItem("token");

        if (isVisual2D(selectedMedium)) {
            if (piece) {
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
                });
            } else {
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
        </div>
    )
}

export default AddArtDialog;