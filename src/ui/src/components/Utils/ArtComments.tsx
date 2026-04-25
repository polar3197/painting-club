import { useState, useEffect } from "react";
import { Visual2DOut, CommentOut, get_comments, post_comment, delete_comment, thumbUrl, block_user, unblock_user } from "../../api";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import ArtZoomIn from "./ArtZoomIn";
import ContextPopup from "./ContextPopup";
import ReportDialog from "./ReportDialog";
import ConfirmDialog from "./ConfirmDialog";
import "../../styles/utils/art-comments.css";

const ArtComments = ({ piece, setIsOpen }: { piece: Visual2DOut; setIsOpen: (v: boolean) => void }) => {
    const currentUser = (localStorage.getItem("username") ?? "").toLowerCase();
    const token = localStorage.getItem("token");
    const auth = useAuth();
    const blockedUsernames = auth?.blockedUsernames ?? [];
    const noteBlocked = auth?.noteBlocked ?? (() => {});
    const noteUnblocked = auth?.noteUnblocked ?? (() => {});
    const navigate = useNavigate();
    const [comments, setComments] = useState<CommentOut[]>([]);
    const [input, setInput] = useState("");
    const [isZoomedIn, setIsZoomedIn] = useState(false);
    // Start with the thumb for instant paint, swap to full-res once it finishes preloading.
    const [imgSrc, setImgSrc] = useState(thumbUrl(piece.id));

    // Kebab / report / block state.
    const [popupAnchor, setPopupAnchor] = useState<{ x: number; y: number } | null>(null);
    const [activeComment, setActiveComment] = useState<CommentOut | null>(null);
    const [showReport, setShowReport] = useState(false);
    const [pendingBlock, setPendingBlock] = useState<string | null>(null);
    const [pendingUnblock, setPendingUnblock] = useState<string | null>(null);

    const confirmBlock = async () => {
        if (!pendingBlock) return;
        const u = pendingBlock;
        setPendingBlock(null);
        try {
            await block_user(u, token);
            noteBlocked(u);
        } catch (err) {
            alert((err as Error).message || "Could not block.");
        }
    };

    const confirmUnblock = async () => {
        if (!pendingUnblock) return;
        const u = pendingUnblock;
        setPendingUnblock(null);
        try {
            await unblock_user(u, token);
            noteUnblocked(u);
        } catch (err) {
            alert((err as Error).message || "Could not unblock.");
        }
    };

    useEffect(() => {
        get_comments(piece.id, token).then(setComments).catch(() => {});
    }, [piece.id]);

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
            {activeComment && (
                <button
                    className="context-popup-row"
                    onClick={() => {
                        const u = activeComment.username;
                        const isBlocked = blockedUsernames.includes(u);
                        setPopupAnchor(null);
                        if (isBlocked) setPendingUnblock(u);
                        else setPendingBlock(u);
                    }}
                >
                    {blockedUsernames.includes(activeComment.username) ? 'unblock' : 'block'} @{activeComment.username}
                </button>
            )}
        </ContextPopup>
        <ReportDialog
            open={showReport}
            targetType="comment"
            targetId={activeComment?.id ?? null}
            onClose={() => setShowReport(false)}
        />
        {pendingBlock && (
            <ConfirmDialog
                message={`If you block @${pendingBlock}, they can no longer comment on your pieces. You'll still see anything they post elsewhere — in case they're talking about you in another comment section. If something more serious comes up, use the report button or reach out to Charlie directly.`}
                confirmLabel="block"
                cancelLabel="nope"
                onConfirm={confirmBlock}
                onCancel={() => setPendingBlock(null)}
            />
        )}
        {pendingUnblock && (
            <ConfirmDialog
                message={`unblock @${pendingUnblock}? They'll be able to comment on your pieces again.`}
                confirmLabel="unblock"
                cancelLabel="nope"
                onConfirm={confirmUnblock}
                onCancel={() => setPendingUnblock(null)}
            />
        )}
        </>
    );
};

export default ArtComments;
