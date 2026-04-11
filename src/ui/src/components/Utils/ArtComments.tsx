import { useState, useEffect } from "react";
import { Visual2DOut, CommentOut, get_comments, post_comment } from "../../api";
import { useNavigate } from "react-router-dom";
import "../../styles/utils/art-comments.css";

const ArtComments = ({ piece, setIsOpen }: { piece: Visual2DOut; setIsOpen: (v: boolean) => void }) => {
    const currentUser = sessionStorage.getItem("username") ?? "";
    const token = sessionStorage.getItem("token");
    const navigate = useNavigate();
    const [comments, setComments] = useState<CommentOut[]>([]);
    const [input, setInput] = useState("");

    useEffect(() => {
        get_comments(piece.id, token).then(setComments).catch(() => {});
    }, [piece.id]);

    const submit = async () => {
        const text = input.trim();
        if (!text) return;
        setInput("");
        try {
            const newComment = await post_comment(piece.id, text, token);
            setComments(prev => [...prev, newComment]);
        } catch {
            setComments(prev => [...prev, { id: crypto.randomUUID(), username: currentUser, firstname: null, text, created_at: new Date().toISOString() }]);
        }
    };

    return (
        <div className="art-comments-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setIsOpen(false); }}>
            <div className="art-comments-panel">
                <div className="art-comments-image">
                    <img src={piece.file_path} alt={piece.title} />
                </div>
                <div className="art-comments-section">
                    <div className="art-comments-header">{piece.title}</div>
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
                                    <div className="art-comment">{c.text}</div>
                                    {isOwn && (
                                        <div className="art-comment-label">
                                            <span className="art-comment-label-name">&lt;</span>
                                        </div>
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
    );
};

export default ArtComments;
