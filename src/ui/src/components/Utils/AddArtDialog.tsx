
import { Dispatch, SetStateAction } from "react";
import PaintingForm from "../Utils/PaintingForm";
import "../../styles/utils/dialog.css";

// this element will be z= 100 and centered relative to the whole page
const AddArtDialog = ({ setShowDialog, selectedMedium } 
    : { setShowDialog : Dispatch<SetStateAction<boolean>>, selectedMedium : string | null;}
) => {
    const addArt = () => {
        // persist art to db and refetch all media from db
        setShowDialog(false);
    }

    return (
        <div className="dialog">
            <div className="exit">
                <button onClick={() => setShowDialog(false)}>x</button>
            </div>
            <div className="submit">
                <button onClick={() => addArt()}>submit</button>
            </div>
            {selectedMedium == "painting" && <PaintingForm />}
        </div>
    )
}

export default AddArtDialog;