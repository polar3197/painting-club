import { Dispatch, SetStateAction, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Profile, open_dm } from "../../api";
import "../../styles/user-profile/user-deets.css";
import "../../styles/portfolio.css";
import { useAuth } from "../../context/AuthContext";
import { useAdminPending } from "../../hooks/useAdminPending";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import { GearIcon, PencilIcon, PaperPlaneIcon, MailIcon } from "../Utils/Icons";
import ShareMediaDialog from "../Utils/ShareMediaDialog";

// Name, location, owner actions and the artist statement. Editing no longer
// happens inline — the pencil opens /edit-profile (details + color scheme),
// same as the iOS app.
const UserInfo = ({ profile, selectedMedium, selectedKeywords }: {
    profile: Profile;
    setProfile: Dispatch<SetStateAction<Profile | null>>;
    selectedMedium: string | null;
    selectedKeywords: string[];
}) => {
    const [showShare, setShowShare] = useState(false);
    const { token } = useAuth()!;
    const navigate = useNavigate();
    const adminPending = useAdminPending();
    const unread = useUnreadCount();
    const [openingDm, setOpeningDm] = useState(false);

    const handlePortfolioView = () => {
        if (!selectedMedium) return;
        const params = new URLSearchParams({ medium: selectedMedium });
        if (selectedKeywords.length > 0) params.set("keywords", selectedKeywords.join(","));
        navigate(`/members/${profile.username}/portfolio?${params.toString()}`);
    };

    const messageOwner = async () => {
        if (openingDm) return;
        setOpeningDm(true);
        try {
            const convo = await open_dm(profile.username, token);
            navigate(`/messages/${convo.id}`, { state: { title: convo.title, type: convo.type, partnerUsername: convo.partner_username } });
        } catch (err) {
            alert((err as Error).message || "could not open messages");
        } finally {
            setOpeningDm(false);
        }
    };

    return (
        <div className="user-fields">
            <div className="user-identity">
                <div className="user-name"><p>{profile.firstname} {profile.lastname}</p></div>
                <div className="user-location"><p>{[profile.city, profile.state].filter(Boolean).join(", ")}</p></div>
                {selectedMedium && (
                    <div className="portfolio-view-toggle" onClick={handlePortfolioView}>portfolio view</div>
                )}
                {!profile.is_owner && !profile.viewer_blocked_by_owner && (
                    <div className="owner-actions">
                        <button className="owner-action-btn" aria-label="message" title="message" onClick={messageOwner} disabled={openingDm}>
                            <MailIcon />
                        </button>
                    </div>
                )}
                {profile.is_owner && (
                    <div className="owner-actions">
                        <button className="owner-action-btn" aria-label="settings" title="settings" onClick={() => navigate("/settings")}>
                            <GearIcon />
                            {adminPending.total > 0 && <span className="owner-action-dot" />}
                        </button>
                        <button className="owner-action-btn" aria-label="edit profile" title="edit profile" onClick={() => navigate("/edit-profile")}>
                            <PencilIcon />
                        </button>
                        <button className="owner-action-btn" aria-label="messages" title="messages" onClick={() => navigate("/messages")}>
                            <MailIcon />
                            {unread > 0 && <span className="owner-action-dot" />}
                        </button>
                        <button className="owner-action-btn" aria-label="share a portfolio" title="share a portfolio" onClick={() => setShowShare(true)}>
                            <PaperPlaneIcon />
                        </button>
                    </div>
                )}
            </div>
            {showShare && (
                <ShareMediaDialog username={profile.username} media={profile.media ?? []} onClose={() => setShowShare(false)} />
            )}
            <div className="user-field-element">
                <span className="artist-statement-label">Artist Statement</span>
                <hr></hr>
                <p className="user-bio">{profile.bio}</p>
            </div>
        </div>
    )
}

export default UserInfo;
