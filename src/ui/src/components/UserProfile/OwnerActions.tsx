import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Profile, open_dm } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { useAdminPending } from "../../hooks/useAdminPending";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import { GearIcon, PencilIcon, PaperPlaneIcon, MailIcon, GalleryIcon } from "../Utils/Icons";
import ShareMediaDialog from "../Utils/ShareMediaDialog";

// The vertical stack of square buttons against the profile picture. Owner:
// settings / edit / messages / share (the iOS set) + portfolio view. Visitor:
// message the owner (unless they've blocked you) + portfolio view.
export default function OwnerActions({ profile, selectedMedium, selectedKeywords }: {
  profile: Profile;
  selectedMedium: string | null;
  selectedKeywords: string[];
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

  const portfolioView = () => {
    if (!selectedMedium) return;
    const params = new URLSearchParams({ medium: selectedMedium });
    if (selectedKeywords.length > 0) params.set("keywords", selectedKeywords.join(","));
    navigate(`/members/${profile.username}/portfolio?${params.toString()}`);
  };
  const portfolioBtn = (
    <button className="owner-action-btn" aria-label="portfolio view" onClick={portfolioView} disabled={!selectedMedium}><GalleryIcon /></button>
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
