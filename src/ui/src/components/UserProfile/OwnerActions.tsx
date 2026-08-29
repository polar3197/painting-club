import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Profile, open_dm } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { useAdminPending } from "../../hooks/useAdminPending";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import { GearIcon, PencilIcon, PaperPlaneIcon, MailIcon } from "../Utils/Icons";
import ShareMediaDialog from "../Utils/ShareMediaDialog";

// The square buttons stacked under the name. Owner: settings / edit /
// messages / share (the iOS set). Visitor: message the owner, unless
// they've blocked you.
export default function OwnerActions({ profile }: { profile: Profile }) {
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

  if (!profile.is_owner) {
    if (profile.viewer_blocked_by_owner) return null;
    return (
      <div className="owner-actions">
        <button className="owner-action-btn" aria-label="message" onClick={messageOwner} disabled={openingDm}><MailIcon /></button>
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
      {showShare && <ShareMediaDialog username={profile.username} media={profile.media ?? []} onClose={() => setShowShare(false)} />}
    </div>
  );
}
