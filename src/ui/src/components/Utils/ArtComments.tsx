import { useState, useEffect } from "react";
import { Visual2DOut, CommentOut, get_comments, post_comment, delete_comment, thumbUrl } from "../../api";
import { useNavigate } from "react-router-dom";
import ArtZoomIn from "./ArtZoomIn";
import ContextPopup from "./ContextPopup";
import ReportDialog from "./ReportDialog";
import "../../styles/utils/art-comments.css";
import { useAuth } from "../../context/AuthContext";

const ArtComments = ({ piece, setIsOpen }: { piece: Visual2DOut; setIsOpen: (v: boolean) => void }) => {
    const { token, currentUser: user } = useAuth()!;
    const currentUser = (user ?? "").toLowerCase();
    const navigate = useNavigate();
    const [comments, setComments] = useState<CommentOut[]>([]);
    const [input, setInput] = useState("");
    const [isZoomedIn, setIsZoomedIn] = useState(false);
    // Start with the thumb for instant paint, swap to full-res once it finishes preloading.
    const [imgSrc, setImgSrc] = useState(thumbUrl(piece.id));

    // Kebab / report state. Block lives on the user's profile-pic flip, not in the comment menu.
    const [popupAnchor, setPopupAnchor] = useState<{ x: number; y: number } | null>(null);
    const [activeComment, setActiveComment] = useState<CommentOut | null>(null);
    const [showReport, setShowReport] = useState(false);

    useEffect(() => {
        get_comments(piece.id, token).then(setComments).catch(() => {});
    }, [piece.id, token]);

    useEffect(() => {
        setImgSrc(thumbUrl(piece.id));
        const full = new Image();
        full.onload = () => setImgSrc(piece.file_path);
        full.src = piece.file_path;
    }, [piece.id, piece.file_path]);

    const submit = async () => {
        const text = input.trim();
        if (!text) return;
        setInput("");
        try {
            const newComment = await post_comment(piece.id, text, token);
            setComments(prev => [...prev, newComment]);
        } catch (err) {
            // Don't fabricate a local comment — that creates the illusion of success
            // while the server never received it. Restore the text and surface the error.
            setInput(text);
            alert((err as Error).message || "Could not post comment");
        }
    };

    const handleDelete = async (commentId: string) => {
        try {
            await delete_comment(piece.id, commentId, token);
            setComments(prev => prev.filter(c => c.id !== commentId));
        } catch (err) {
            alert((err as Error).message || "Could not delete comment");
        }
    };

    return (
        <>
        <div className="art-comments-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setIsOpen(false); }}>
            <div className="art-comments-panel">
                <div className="art-comments-image" onClick={() => setIsZoomedIn(true)} style={{ cursor: "pointer" }}>
                    <img src={imgSrc} alt={piece.title} />
                </div>
                <div className="art-comments-section">
                    <div className="art-comments-header">
                        <span className="art-comments-title">{piece.title}</span>
                        <button
                            className="art-comments-close"
                            onClick={() => setIsOpen(false)}
                            aria-label="Close comments"
                        >
                            ×
                        </button>
                    </div>
                    <div className="art-comments-list">
                        {comments.map((c) => {
                            const isOwn = c.username === currentUser;
                            const display = c.firstname || c.username;
                            return (
                                <div key={c.id} className={`art-comment-row ${isOwn ? "art-comment-row--own" : "art-comment-row--other"}`}>
                                    {!isOwn && (
                                        <div className="art-comment-label" onClick={() => { setIsOpen(false); navigate(`/members/${c.username}/profile`); }}>
                                            <span className="art-comment-label-name">{display} &gt;</span>
                                            {c.firstname && <span className="art-comment-label-username">@{c.username}</span>}
                                        </div>
                                    )}
                                    <div className="art-comment">
                                        {c.text}
                                        {isOwn && (
                                            <button
                                                className="art-comment-delete"
                                                aria-label="Delete comment"
                                                onClick={() => handleDelete(c.id)}
                                            >
                                                x
                                            </button>
                                        )}
                                    </div>
                                    {isOwn ? (
                                        <div className="art-comment-label">
                                            <span className="art-comment-label-name">&lt;</span>
                                        </div>
                                    ) : (
                                        <button
                                            className="art-comment-kebab"
                                            aria-label="comment options"
                                            onClick={(e) => {
                                                setActiveComment(c);
                                                setPopupAnchor({ x: e.clientX, y: e.clientY });
                                            }}
                                        >
                                            ⋮
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <div className="art-comments-input-bar">
                        <input
                            className="art-comments-input"
                            value={input}
                            placeholder="go for it. comment..."
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                        />
                        <button className="art-comments-submit" onClick={submit}>↑</button>
                    </div>
                </div>
            </div>
        </div>
        {isZoomedIn && (
            <ArtZoomIn
                isOwner={false}
                imgPath={piece.file_path}
                setIsZoomedIn={setIsZoomedIn}
                reportArtId={currentUser ? piece.id : undefined}
            />
        )}
        <ContextPopup
            open={popupAnchor !== null}
            anchor={popupAnchor}
            onClose={() => setPopupAnchor(null)}
        >
            <button
                className="context-popup-row"
                onClick={() => {
                    setPopupAnchor(null);
                    setShowReport(true);
                }}
            >
                report comment
            </button>
        </ContextPopup>
        <ReportDialog
            open={showReport}
            targetType="comment"
            targetId={activeComment?.id ?? null}
            onClose={() => setShowReport(false)}
        />
        </>
    );
};

export default ArtComments;
