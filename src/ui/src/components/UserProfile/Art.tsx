
import { useState, useEffect } from "react";
import { Profile } from "../../api";
import AddArtDialog from "../Utils/AddArtDialog";
import ArtZoomIn from "../Utils/ArtZoomIn";
import { get_members_visual_2d, remove_visual_2d, Visual2DOut } from "../../api";

import '../../styles/user-profile/art.css';

const Visual2DPiece = ({ isOwner, piece, onRemove, onEdit }: { isOwner: boolean; piece: Visual2DOut; onRemove: () => void; onEdit: () => void }) => {
    const [isZoomedIn, setIsZoomedIn] = useState(false);

    const removeArt = async (
        {pieceId} : {pieceId : string}
    ) => {
        await remove_visual_2d(pieceId, sessionStorage.getItem("token"));
        onRemove();
    }

    return (    
        <>
        {isZoomedIn && 
            <ArtZoomIn
                isOwner={isOwner}
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
                {piece.location && <p><b>Location: </b>{piece.location}</p>}
                {piece.song && <p><b>Made listening to: </b>{[piece.song, piece.song_artist].filter(Boolean).join(", ")}</p>}
                {piece.width && piece.height && <p><b>Dimensions: </b> {piece.width}"x{piece.height}"</p> }                          
                {piece.keywords && <p><b>keywords: </b>{piece.keywords.join(", ")}</p>}         

                {isOwner && (
                    <div className="art-element-buttons">
                        <div className="edit">
                            <button onClick={() => onEdit()}>edit</button>
                        </div>
                        <div className="remove">
                            <button onClick={() => removeArt({ pieceId: piece.id })}>remove</button>
                        </div>
                    </div>
                )}                                                  
            </div>
        </div>
        </> 
    )
} 


const Art = ({ profile, selectedMedium, selectedKeywords, refresh, onRefresh, onKeywordsLoaded } : { profile: Profile; selectedMedium: string | null; selectedKeywords: string[]; refresh: number; onRefresh: () => void; onKeywordsLoaded: (keywords: string[]) => void; }) => {
    const [showDialog, setShowDialog] = useState(false);
    const [editingPiece, setEditingPiece] = useState<Visual2DOut | null>(null);
    const [art, setArt] = useState<Visual2DOut[]>([]);

    useEffect(() => {
        const getArt = async() => {
            if (selectedMedium == "painting" ||
                selectedMedium == "drawing" ||
                selectedMedium == "stained glass" ||
                selectedMedium == "photography")
            {
                const data = await get_members_visual_2d(profile.username, selectedMedium);
                setArt(data);
                const unique = [...new Set(data.flatMap(p => p.keywords ?? []))];
                onKeywordsLoaded(unique);
            } else {
                onKeywordsLoaded([]);
            }
        }

        getArt();
    }, [selectedMedium, refresh]);

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
                    onSuccess={onRefresh}
                />
            }
            { editingPiece && selectedMedium &&
                <AddArtDialog
                    setShowDialog={() => setEditingPiece(null)}
                    selectedMedium={selectedMedium}
                    username={profile.username}
                    onSuccess={onRefresh}
                    piece={editingPiece}
                />
            }
            <div className="art">
                {(selectedMedium == "painting" ||
                    selectedMedium == "stained glass" ||
                    selectedMedium == "drawing" ||
                    selectedMedium == "photography")
                    ?
                    (selectedKeywords.length > 0 ? art.filter(p => p.keywords?.some(k => selectedKeywords.includes(k))) : art)
                        .map(piece => <Visual2DPiece key={piece.id} isOwner={profile.is_owner} piece={piece} onRemove={onRefresh} onEdit={() => setEditingPiece(piece)} />)
                :
                `${selectedMedium} is empty atm`}
            </div>
        </div>
    )
}

export default Art;