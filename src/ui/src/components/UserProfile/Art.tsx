
import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Profile } from "../../api";
import AddArtDialog from "../Utils/AddArtDialog";
import ArtZoomIn from "../Utils/ArtZoomIn";
import ArtComments from "../Utils/ArtComments";
import { get_members_visual_2d, remove_visual_2d, Visual2DOut } from "../../api";

import '../../styles/user-profile/art.css';

const Visual2DPiece = ({ isOwner, piece, onRemove, onEdit }: { isOwner: boolean; piece: Visual2DOut; onRemove: () => void; onEdit: () => void }) => {
    const [isZoomedIn, setIsZoomedIn] = useState(false);
    const [showComments, setShowComments] = useState(false);

    const removeArt = async ({ pieceId }: { pieceId: string }) => {
        await remove_visual_2d(pieceId, localStorage.getItem("token"));
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
        {showComments &&
            <ArtComments piece={piece} setIsOpen={() => setShowComments(false)} />
        }
        <div id={`art-${piece.id}`} className="art-element">
            <div className="art-visual" onClick={() => setIsZoomedIn(true)}>
                <img src={piece.file_path} alt={piece.title} />
            </div>
            <div className="art-right">
                <div className="art-details">
                    <div className="art-details-header">
                        <div className="art-details-title">{piece.title}</div>
                        {piece.date && <div className="art-details-element">{piece.date}</div>}
                    </div>
                    <div className="art-details-elements">
                        {piece.location && <div className="art-details-element"><img className="art-detail-icon" src="/imgs/location.png" />{piece.location}</div>}
                        {piece.song && <div className="art-details-element"><img className="art-detail-icon" src="/imgs/music.png" />{[piece.song, piece.song_artist].filter(Boolean).join(", ")}</div>}
                        {piece.width && piece.height && <div className="art-details-element"><img className="art-detail-icon dimensions" src="/imgs/dimensions.png" />{piece.width}"x{piece.height}"</div>}
                        {piece.keywords && <div className="art-details-element"><b>keywords: </b>{piece.keywords.join(", ")}</div>}
                    </div>
                </div>
                <div className="art-details-footer">
                    {isOwner ? (
                        <div className="art-element-buttons">
                            <div className="edit">
                                <button onClick={() => onEdit()}>edit</button>
                            </div>
                            {piece.comments_enabled && (
                                <div className="comments-toggle">
                                    <button onClick={() => setShowComments(true)}>comments</button>
                                </div>
                            )}
                            <div className="remove">
                                <button onClick={() => removeArt({ pieceId: piece.id })}>remove</button>
                            </div>
                        </div>
                    ) : piece.comments_enabled && (
                        <div className="art-element-buttons art-element-buttons--centered">
                            <div className="comments-toggle">
                                <button onClick={() => setShowComments(true)}>comments</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
        </>
    )
}


const Art = ({ profile, selectedMedium, selectedKeywords, refresh, onRefresh, onKeywordsLoaded, scrollToArtId } : { profile: Profile; selectedMedium: string | null; selectedKeywords: string[]; refresh: number; onRefresh: () => void; onKeywordsLoaded: (keywords: string[]) => void; scrollToArtId?: string | null; }) => {
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
    }, [profile.username, selectedMedium, refresh]);

    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [pendingScrollId, setPendingScrollId] = useState(scrollToArtId ?? null);

    useEffect(() => {
        if (!pendingScrollId || art.length === 0) return;
        const el = document.getElementById(`art-${pendingScrollId}`);
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            setPendingScrollId(null);
            const next = new URLSearchParams(searchParams);
            next.delete("artId");
            next.delete("medium");
            navigate(`?${next.toString()}`, { replace: true });
        }
    }, [art, pendingScrollId]);

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
