
import { useState, useEffect } from "react";
import { Profile } from "../../api";
import AddArtDialog from "../Utils/AddArtDialog";
import ArtZoomIn from "../Utils/ArtZoomIn";
import { get_members_visual_2d, Visual2DOut } from "../../api";

import '../../styles/user-profile/art.css';

const Visual2DPiece = ({ piece }: { piece: Visual2DOut }) => {
    const [isZoomedIn, setIsZoomedIn] = useState(false);

    return (    
        <>
        {isZoomedIn && 
            <ArtZoomIn 
                imgPath={piece.file_path} 
                setIsZoomedIn={setIsZoomedIn}
            />
        }
                         
        <div className="art-element">
            
            <div className="art-visual" onClick={() => setIsZoomedIn(true)}>                                                                                                    
                <img src={piece.file_path} alt={piece.title} />
            </div>                                                                                                                          
            <div className="art-details">
                <p><b>Title: </b> {piece.title}</p> 
                {piece.date &&  <p><b>Created: </b>{piece.date}</p>}    
                {piece.song && <p><b>Made listening to: </b>{piece.song}</p>}
                {piece.width && piece.height && <p><div className="art-detail-header">Dimensions: </div> {piece.width}"x{piece.height}"</p> }                                                                                     
            </div>
        </div>
        </> 
    )
} 


const Art = ({ profile, selectedMedium } : { profile: Profile; selectedMedium: string | null; }) => {
    const [showDialog, setShowDialog] = useState(false);
    const [art, setArt] = useState<Visual2DOut[]>([])

    useEffect(() => {
        const getArt = async() => {
            // if medium is visual_2d
            if (selectedMedium == "acrylic" ||
                selectedMedium == "watercolor" ||
                selectedMedium == "oil" ||
                selectedMedium == "drawing" ||
                selectedMedium == "stained glass" ||
                selectedMedium == "photography") 
            {
                const data = await get_members_visual_2d(profile.username, selectedMedium);
                setArt(data);
            }
        }

        getArt();
    }, [selectedMedium]);

    return (
        <div className='art-wrapper'>
            {profile.is_owner && 
                <div className="add">
                    <button onClick={() => setShowDialog(true)}>+</button>
                </div>
            }
            { showDialog && selectedMedium &&
                <AddArtDialog
                    setShowDialog={setShowDialog}
                    selectedMedium={selectedMedium}
                    username={profile.username}
                />
            }
            <div className="art">
                {(selectedMedium == "acrylic" ||
                    selectedMedium == "watercolor" ||
                    selectedMedium == "oil" ||
                    selectedMedium == "stained glass" ||
                    selectedMedium == "drawing" ||
                    selectedMedium == "photography") 
                    ?
                    art.map(piece => <Visual2DPiece key={piece.id} piece={piece} />)
                :
                `${selectedMedium} is empty atm`}
            </div>
        </div>
    )
}

export default Art;