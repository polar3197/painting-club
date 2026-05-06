import { Dispatch, SetStateAction, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { block_user, unblock_user } from "../../api";
import ReportDialog from "./ReportDialog";
import ConfirmDialog from "./ConfirmDialog";
import ContextPopup from "./ContextPopup";
import DeleteAccountDialog from "./DeleteAccountDialog";
import "../../styles/utils/dialog.css";

const ArtZoomIn = ({
    isOwner,
    imgPath,
    setIsZoomedIn,
    onChangePic,
    reportArtId,
    blockableUsername,
}: {
    isOwner: boolean;
    imgPath: string;
    setIsZoomedIn: Dispatch<SetStateAction<boolean>>;
    onChangePic?: (file: File) => Promise<void> | void;
    // Set when this is an art piece and the viewer is allowed to report it.
    reportArtId?: string;
    // Set when this is a profile pic and the viewer should be able to block the owner.
    blockableUsername?: string;
}) => {

    const [flip, setFlip] = useState<"idle" | "flip" | "unflip">("idle");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const auth = useAuth();
    const navigate = useNavigate();
    const currentUser = auth?.currentUser ?? null;
    const logout = auth?.logout ?? (() => {});
    const blockedUsernames = auth?.blockedUsernames ?? [];
    const noteBlocked = auth?.noteBlocked ?? (() => {});
    const noteUnblocked = auth?.noteUnblocked ?? (() => {});
    const token = localStorage.getItem("token");
    const [showReport, setShowReport] = useState(false);
    const [pendingBlock, setPendingBlock] = useState<string | null>(null);
    const [pendingUnblock, setPendingUnblock] = useState<string | null>(null);
    const [popupAnchor, setPopupAnchor] = useState<{ x: number; y: number } | null>(null);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);

    const isBlocked = blockableUsername ? blockedUsernames.includes(blockableUsername) : false;
    const canReport = !isOwner && !!reportArtId && !!currentUser;
    const canBlock = !isOwner && !!blockableUsername && !!currentUser;
    const showDeleteAccount = isOwner && !!onChangePic && !!currentUser;
    const showKebab = canReport || canBlock || showDeleteAccount;

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !onChangePic) return;
        await onChangePic(file);
        setIsZoomedIn(false);
    };

    const confirmBlock = async () => {
        if (!pendingBlock) return;
        const u = pendingBlock;
        setPendingBlock(null);
        try { await block_user(u, token); noteBlocked(u); }
        catch (err) { alert((err as Error).message || "Could not block."); }
    };

    const confirmUnblock = async () => {
        if (!pendingUnblock) return;
        const u = pendingUnblock;
        setPendingUnblock(null);
        try { await unblock_user(u, token); noteUnblocked(u); }
        catch (err) { alert((err as Error).message || "Could not unblock."); }
    };

    return (
        <div className="blowup-backdrop" onClick={() => setIsZoomedIn(false)}>
        <div className="blowup-wrapper">
            <div className={`blowup-dialog ${flip === "flip" ? "flip" : ""}`}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    setFlip(flip === "flip" ? "unflip" : "flip");
                }}
            >
                <div className="card-front">
                    <img
                        src={imgPath}
                        alt={"no image"}
                    />
                </div>
                <div className="card-back">
                    {isOwner && onChangePic && (
                        <>
                            <button
                                className="change-pic-btn"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    fileInputRef.current?.click();
                                }}
                            >
                                change pic
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/png,image/jpeg,image/heic,image/heif,.heic,.heif"
                                style={{ display: "none" }}
                                onChange={handleFile}
                            />
                        </>
                    )}
                    {showKebab && (
                        <button
                            className="back-kebab"
                            aria-label="options"
                            onClick={(e) => {
                                e.stopPropagation();
                                setPopupAnchor({ x: e.clientX, y: e.clientY });
                            }}
                        >
                            ⋮
                        </button>
                    )}
                </div>
            </div>
        </div>
        <ContextPopup
            open={popupAnchor !== null}
            anchor={popupAnchor}
            onClose={() => setPopupAnchor(null)}
        >
            {canReport && (
                <button
                    className="context-popup-row"
                    onClick={() => { setPopupAnchor(null); setShowReport(true); }}
                >
                    report
                </button>
            )}
            {canBlock && (
                <button
                    className="context-popup-row"
                    onClick={() => {
                        setPopupAnchor(null);
                        if (isBlocked) setPendingUnblock(blockableUsername!);
                        else setPendingBlock(blockableUsername!);
                    }}
                >
                    {isBlocked ? `unblock @${blockableUsername}` : `block @${blockableUsername}`}
                </button>
            )}
            {showDeleteAccount && (
                <button
                    className="context-popup-row context-popup-row-destructive"
                    onClick={() => {
                        setPopupAnchor(null);
                        setShowDeleteDialog(true);
                    }}
                >
                    delete account
                </button>
            )}
        </ContextPopup>
        {reportArtId && (
            <ReportDialog
                open={showReport}
                targetType="art"
                targetId={reportArtId}
                onClose={() => setShowReport(false)}
            />
        )}
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
        {showDeleteAccount && (
            <DeleteAccountDialog
                open={showDeleteDialog}
                username={currentUser ?? ""}
                onClose={() => setShowDeleteDialog(false)}
                onDeleted={() => {
                    setShowDeleteDialog(false);
                    setIsZoomedIn(false);
                    logout();
                    navigate("/landing-page");
                }}
            />
        )}
    </div>
    );
};

export default ArtZoomIn;
