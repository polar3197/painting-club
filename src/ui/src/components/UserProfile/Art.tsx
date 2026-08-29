
import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Profile } from "../../api";
import AddArtDialog from "../Utils/AddArtDialog";
import ArtZoomIn from "../Utils/ArtZoomIn";
import ArtComments from "../Utils/ArtComments";
import ArtImage from "../Utils/ArtImage";
import ConfirmDialog from "../Utils/ConfirmDialog";
import { swr, getCached } from "../../cache";
import { useAuth } from "../../context/AuthContext";
import { get_members_visual_2d, remove_visual_2d, add_new_visual_2d, Visual2DOut, Visual2DIn, get_members_written_form, add_new_written_form, WrittenFormOut, WrittenFormIn, get_media, MediaType } from "../../api";
import WrittenFormPiece from "./WrittenForm";
import CollectionRow from "./CollectionRow";

import '../../styles/user-profile/art.css';

const Visual2DPiece = ({
    isOwner,
    piece,
    viewerBlockedByOwner,
    onRemove,
    onEdit,
}: {
    isOwner: boolean;
    piece: Visual2DOut;
    viewerBlockedByOwner: boolean;
    onRemove: () => void;
    onEdit: () => void;
}) => {
    const auth = useAuth();
    const currentUser = auth?.currentUser ?? null;
    const token = auth?.token ?? null;
    const [isZoomedIn, setIsZoomedIn] = useState(false);
    const [showComments, setShowComments] = useState(false);
    const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

    const removeArt = async ({ pieceId }: { pieceId: string }) => {
        await remove_visual_2d(pieceId, token);
        setShowRemoveConfirm(false);
        onRemove();
    }

    return (
        <>
        {isZoomedIn &&
            <ArtZoomIn
                isOwner={isOwner}
                imgPath={piece.file_path}
                setIsZoomedIn={setIsZoomedIn}
                reportArtId={!isOwner && currentUser ? piece.id : undefined}
            />
        }
        {showComments &&
            <ArtComments piece={piece} setIsOpen={() => setShowComments(false)} />
        }
        {showRemoveConfirm &&
            <ConfirmDialog
                onConfirm={() => removeArt({ pieceId: piece.id })}
                onCancel={() => setShowRemoveConfirm(false)}
            />
        }
        <div id={`art-${piece.id}`} className="art-element">
            <div className="art-visual" onClick={() => setIsZoomedIn(true)}>
                <ArtImage artId={piece.id} fullSrc={piece.file_path} alt={piece.title} />
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
                                <button onClick={() => setShowRemoveConfirm(true)}>remove</button>
                            </div>
                        </div>
                    ) : piece.comments_enabled && currentUser && !viewerBlockedByOwner && (
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


const Art = ({ profile, selectedMedium, selectedKeywords, refresh, onRefresh, onKeywordsLoaded, scrollToArtId, onMoved } : { profile: Profile; selectedMedium: string | null; selectedKeywords: string[]; refresh: number; onRefresh: () => void; onKeywordsLoaded: (keywords: string[]) => void; scrollToArtId?: string | null; onMoved?: (newMedium: string) => void; }) => {
    const { token } = useAuth()!;
    const [showDialog, setShowDialog] = useState(false);
    const [editingPiece, setEditingPiece] = useState<Visual2DOut | null>(null);
    const [editingWrittenForm, setEditingWrittenForm] = useState<WrittenFormOut | null>(null);
    const [art, setArt] = useState<Visual2DOut[]>([]);
    const [writtenForms, setWrittenForms] = useState<WrittenFormOut[]>([]);
    const [allMedia, setAllMedia] = useState<MediaType[]>(() => getCached<MediaType[]>("media") ?? []);
    const [pendingPieces, setPendingPieces] = useState<
        { tempId: string; medium: string; previewUrl: string; title: string; aspectRatio: number }[]
    >([]);
    const [pendingWrittenForms, setPendingWrittenForms] = useState<
        { tempId: string; medium: string; title: string; ext: string }[]
    >([]);

    const startUpload = (payload: Visual2DIn) => {
        const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const previewUrl = URL.createObjectURL(payload.file);
        const aspectRatio =
            payload.width && payload.height && Number(payload.height) > 0
                ? Number(payload.width) / Number(payload.height)
                : 1;
        setPendingPieces(p => [...p, { tempId, medium: payload.medium, previewUrl, title: payload.title || "uploading…", aspectRatio }]);
        add_new_visual_2d(token, payload)
            .then(() => onRefresh())
            .catch((err: any) => alert(err?.message || "Upload failed"))
            .finally(() => {
                setPendingPieces(p => p.filter(x => x.tempId !== tempId));
                URL.revokeObjectURL(previewUrl);
            });
    };

    const startWrittenFormUpload = (payload: WrittenFormIn) => {
        const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const ext = (payload.file?.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? "TXT").toUpperCase();
        setPendingWrittenForms(p => [...p, { tempId, medium: payload.medium, title: payload.title || "uploading…", ext }]);
        add_new_written_form(token, payload)
            .then(() => onRefresh())
            .catch((err: any) => alert(err?.message || "Upload failed"))
            .finally(() => {
                setPendingWrittenForms(p => p.filter(x => x.tempId !== tempId));
            });
    };

    useEffect(() => {
        swr("media", get_media, setAllMedia).catch(() => {});
    }, []);

    const selectedMediumType = selectedMedium ? allMedia.find(m => m.name === selectedMedium)?.type ?? null : null;
    const isVisual2D = selectedMediumType === "visual_2d";
    const isWrittenForm = selectedMediumType === "written_form";

    // Cached lists paint immediately on remount; the fetch then refreshes them.
    useEffect(() => {
        const getArt = async() => {
            if (selectedMedium && isVisual2D) {
                await swr(`art:${profile.username}:${selectedMedium}`, () => get_members_visual_2d(profile.username, selectedMedium), (data) => {
                    setArt(data);
                    onKeywordsLoaded([...new Set(data.flatMap(p => p.keywords ?? []))]);
                });
            } else if (selectedMedium && isWrittenForm) {
                await swr(`written:${profile.username}:${selectedMedium}`, () => get_members_written_form(profile.username, selectedMedium), (data) => {
                    setWrittenForms(data);
                    onKeywordsLoaded([...new Set(data.flatMap(p => p.keywords ?? []))]);
                });
            } else {
                onKeywordsLoaded([]);
            }
        }

        getArt();
    }, [profile.username, selectedMedium, refresh, isVisual2D, isWrittenForm]);

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
                    onCreate={startUpload}
                    onCreateWrittenForm={startWrittenFormUpload}
                />
            }
            { editingPiece && selectedMedium &&
                <AddArtDialog
                    setShowDialog={() => setEditingPiece(null)}
                    selectedMedium={selectedMedium}
                    username={profile.username}
                    onSuccess={onRefresh}
                    onMoved={onMoved}
                    piece={editingPiece}
                />
            }
            { editingWrittenForm && selectedMedium &&
                <AddArtDialog
                    setShowDialog={() => setEditingWrittenForm(null)}
                    selectedMedium={selectedMedium}
                    username={profile.username}
                    onSuccess={onRefresh}
                    onMoved={onMoved}
                    writtenPiece={editingWrittenForm}
                />
            }
            <div className="art">
                {isVisual2D ? (
                    <>
                        {pendingPieces.filter(p => p.medium === selectedMedium).map(p => (
                            <div key={p.tempId} className="art-element">
                                <div className="art-visual" style={{ position: "relative" }}>
                                    <img src={p.previewUrl} alt={p.title} style={{ width: "100%", height: "auto", display: "block", border: "2px black solid", opacity: 0.35 }} />
                                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", justifyContent: "center", alignItems: "center" }}>
                                        <img src="/imgs/groups.png" className="pending-spinner" alt="" style={{ width: 64, height: 64 }} />
                                    </div>
                                </div>
                                <div className="art-right">
                                    <div className="art-details">
                                        <div className="art-details-header">
                                            <div className="art-details-title">{p.title}</div>
                                        </div>
                                        <div className="art-details-elements">
                                            <div className="art-details-element">uploading…</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {(selectedKeywords.length > 0 ? art.filter(p => selectedKeywords.every(k => p.keywords?.includes(k))) : art)
                            .map(piece => <Visual2DPiece key={piece.id} isOwner={profile.is_owner} piece={piece} viewerBlockedByOwner={!!profile.viewer_blocked_by_owner} onRemove={onRefresh} onEdit={() => setEditingPiece(piece)} />)}
                    </>
                ) : isWrittenForm ? (
                    (() => {
                        const filtered = (selectedKeywords.length > 0
                            ? writtenForms.filter(p => selectedKeywords.every(k => p.keywords?.includes(k)))
                            : writtenForms);
                        // Group by series_id while preserving the original (date-desc)
                        // ordering: a group's position in the list is set by its first piece.
                        type Row =
                            | { kind: "piece"; piece: WrittenFormOut }
                            | { kind: "series"; id: string; name: string; pieces: WrittenFormOut[] };
                        const groups: Record<string, { id: string; name: string; pieces: WrittenFormOut[] }> = {};
                        const rows: Row[] = [];
                        for (const p of filtered) {
                            if (!p.series_id) {
                                rows.push({ kind: "piece", piece: p });
                                continue;
                            }
                            if (!groups[p.series_id]) {
                                groups[p.series_id] = { id: p.series_id, name: p.series_name ?? "(untitled series)", pieces: [] };
                                rows.push({ kind: "series", id: p.series_id, name: groups[p.series_id].name, pieces: groups[p.series_id].pieces });
                            }
                            groups[p.series_id].pieces.push(p);
                        }
                        return <>
                            {pendingWrittenForms.filter(p => p.medium === selectedMedium).map(p => (
                                <div key={p.tempId} className="art-element written-form">
                                    <div className="art-visual">
                                        <div className="written-form-tile" style={{ opacity: 0.5 }}>
                                            <div className="written-form-tile-badge">{p.ext}</div>
                                            <div className="written-form-tile-title">{p.title}</div>
                                        </div>
                                    </div>
                                    <div className="art-right">
                                        <div className="art-details">
                                            <div className="art-details-header">
                                                <div className="art-details-title">{p.title}</div>
                                            </div>
                                            <div className="art-details-elements">
                                                <div className="art-details-element">uploading…</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {rows.map(row => row.kind === "piece"
                                ? <WrittenFormPiece
                                    key={row.piece.id}
                                    isOwner={profile.is_owner}
                                    piece={row.piece}
                                    viewerBlockedByOwner={!!profile.viewer_blocked_by_owner}
                                    onRemove={onRefresh}
                                    onEdit={() => setEditingWrittenForm(row.piece)}
                                />
                                : <CollectionRow
                                    key={row.id}
                                    isOwner={profile.is_owner}
                                    pieces={row.pieces}
                                    seriesId={row.id}
                                    seriesName={row.name}
                                    username={profile.username}
                                    selectedMedium={selectedMedium!}
                                    onRefresh={onRefresh}
                                />
                            )}
                        </>;
                    })()
                ) : (
                    `${selectedMedium} is empty atm`
                )}
            </div>
        </div>
    )
}

export default Art;
