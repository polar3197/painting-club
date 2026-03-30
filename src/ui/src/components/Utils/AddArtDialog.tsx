
import { Dispatch, SetStateAction, useState } from "react";

import PaintingForm from "../Utils/PaintingForm";
import "../../styles/utils/dialog.css";
import { add_new_visual_2d } from "../../api";

// this element will be z= 100 and centered relative to the whole page
const AddArtDialog = ({ setShowDialog, selectedMedium, username }
    : { setShowDialog : Dispatch<SetStateAction<boolean>>, selectedMedium : string; username : string; }
) => {
    const [formData, setFormData] = useState<Record<string, any> | null>(null);

    const addArt = async () => {
        if (!formData) return;
        const token = sessionStorage.getItem("token");

        if (selectedMedium == "painting" ||
            selectedMedium == "acrylic" ||
            selectedMedium == "watercolor" ||
            selectedMedium == "oil" ||
            selectedMedium == "stained glass" ||
            selectedMedium == "photography")
        {
            await add_new_visual_2d(token, {
                username,
                medium: selectedMedium,
                title: formData.title,
                location: formData.location,
                song: formData.song,
                date: formData.date,
                width: formData.width,
                height: formData.height,
                file: formData.files,
            });
        }

        setShowDialog(false);
    };

    return (
        <div className="dialog">
            <div className="exit">
                <button onClick={() => setShowDialog(false)}>x</button>
            </div>
            <div className="submit">
                <button onClick={() => addArt()}>submit</button>
            </div>
            {(selectedMedium == "painting" || 
                selectedMedium == "acrylic" ||
                selectedMedium == "watercolor" ||
                selectedMedium == "stained glass" ||
                selectedMedium == "oil" ||
                selectedMedium == "photography")
                && <PaintingForm onDataChange={setFormData} />
            }
        </div>
    )
}

export default AddArtDialog;