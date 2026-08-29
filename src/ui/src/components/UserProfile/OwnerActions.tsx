import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Profile, open_dm } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { useAdminPending } from "../../hooks/useAdminPending";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import { GearIcon, PencilIcon, PaperPlaneIcon, MailIcon, GalleryIcon } from "../Utils/Icons";
import ShareMediaDialog from "../Utils/ShareMediaDialog";

// The vertical stack of square buttons against the profile picture. Owner:
// settings / edit / messages / share (the iOS set) + the portfolio toggle.
// Visitor: message the owner (unless they've blocked you) + the toggle.
export default function OwnerActions({ profile, selectedMedium, portfolioMode, onTogglePortfolio }: {
  profile: Profile;
  selectedMedium: string | null;
  portfolioMode: boolean;
  onTogglePortfolio: () => void;
}) {
  const navigate = useNavigate();
  const { token } = useAuth()!;
  const adminPending = useAdminPending();
  const unread = useUnreadCount();
  const [showShare, setShowShare] = useState(false);
  const [openingDm, setOpeningDm] = useState(false);

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

  // Toggles the grid in place of the rows below the media bar; stays lit
  // while on.
  const portfolioBtn = (
    <button
      className={`owner-action-btn ${portfolioMode ? "on" : ""}`}
      aria-label="portfolio view"
      aria-pressed={portfolioMode}
      onClick={onTogglePortfolio}
      disabled={!selectedMedium}
    ><GalleryIcon /></button>
  );

  if (!profile.is_owner) {
    return (
      <div className="owner-actions">
        {!profile.viewer_blocked_by_owner && (
          <button className="owner-action-btn" aria-label="message" onClick={messageOwner} disabled={openingDm}><MailIcon /></button>
        )}
        {portfolioBtn}
      </div>
    );
  }

  return (
    <div className="owner-actions">
      <button className="owner-action-btn" aria-label="settings" onClick={() => navigate("/settings")}>
        <GearIcon />{adminPending.total > 0 && <span className="owner-action-dot" />}
      </button>
      <button className="owner-action-btn" aria-label="edit profile" onClick={() => navigate("/edit-profile")}><PencilIcon /></button>
      <button className="owner-action-btn" aria-label="messages" onClick={() => navigate("/messages")}>
        <MailIcon />{unread > 0 && <span className="owner-action-dot" />}
      </button>
      <button className="owner-action-btn" aria-label="share a portfolio" onClick={() => setShowShare(true)}><PaperPlaneIcon /></button>
      {portfolioBtn}
      {showShare && <ShareMediaDialog username={profile.username} media={profile.media ?? []} onClose={() => setShowShare(false)} />}
    </div>
  );
}
