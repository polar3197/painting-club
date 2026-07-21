import { Dispatch, SetStateAction, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Profile, get_unread_count, open_dm, update_profile } from "../../api";
import { useAuth } from "../../context/AuthContext";
import ContextPopup from "../Utils/ContextPopup";
import ConfirmDialog from "../Utils/ConfirmDialog";
import DeleteAccountDialog from "../Utils/DeleteAccountDialog";
import "../../styles/user-profile/user-deets.css";
import "../../styles/portfolio.css";

const UNREAD_POLL_MS = 15000;


const UserQuestion = (
    { question, answer } : { question : string; answer : string;}
) => {
    return (
        <div className="question-wrapper">
            <div className="question">
                {question}
            </div>
            <div className="answer">
                {answer}
            </div>
        </div>
    )
}


const UserInfo = (
    {
        profile,
        setProfile,
        selectedMedium,
        selectedKeywords,
    }
    :
    {
        profile : Profile;
        setProfile : Dispatch<SetStateAction<Profile | null>>;
        selectedMedium: string | null;
        selectedKeywords: string[];
    }
) => {
    const [updateProfile, setUpdateProfile] = useState<boolean>(false);
    const [unread, setUnread] = useState(0);
    // Settings gear (owner only) — the iOS Settings screen as a popup menu.
    const [gearAnchor, setGearAnchor] = useState<{ x: number; y: number } | null>(null);
    const [confirmLogout, setConfirmLogout] = useState(false);
    const [showDeleteAccount, setShowDeleteAccount] = useState(false);
    const token = localStorage.getItem("token");
    const navigate = useNavigate();
    const auth = useAuth();

    // Owner-only red dot, refreshed while the tab is visible (mirrors iOS 15s poll).
    useEffect(() => {
        if (!profile.is_owner || !token) return;
        const tick = () => {
            get_unread_count(token).then((r) => setUnread(r.unread)).catch(() => {});
        };
        tick();
        const timer = setInterval(() => {
            if (document.visibilityState === "visible") tick();
        }, UNREAD_POLL_MS);
        return () => clearInterval(timer);
    }, [profile.is_owner, token]);

    const canMail = profile.is_owner
        || (!!auth?.currentUser
            && auth.currentUser !== profile.username
            && !profile.viewer_blocked_by_owner);

    const handleMail = async () => {
        if (profile.is_owner) {
            navigate("/messages");
            return;
        }
        try {
            // Idempotent: opens (or finds) the DM, then lands on it in /messages.
            const conv = await open_dm(profile.username, token);
            navigate(`/messages?c=${conv.id}`);
        } catch (err) {
            alert((err as Error).message);
        }
    };

    const handlePortfolioView = () => {
        if (!selectedMedium) return;
        const params = new URLSearchParams({ medium: selectedMedium });
        if (selectedKeywords.length > 0) params.set("keywords", selectedKeywords.join(","));
        navigate(`/members/${profile.username}/portfolio?${params.toString()}`);
    };

    const handleUpdateProfile = () => {
        if (profile.is_owner) {
            setUpdateProfile(true);
        }
    }

    const handleSumbitProfile = () => {
        setUpdateProfile(false);
        update_profile(profile.username, profile, token);
    }

    return (
        <div className="user-fields">
            <div className="user-identity">
                <div className="user-name" onClick={() => handleUpdateProfile()}>
                    {updateProfile ?
                        <>
                        <textarea
                            rows={1}
                            value={profile.firstname}
                            placeholder="firstname"
                            onChange={(e) => setProfile({ ...profile, firstname: e.target.value })}
                        />
                        <textarea
                            rows={1}
                            value={profile.lastname}
                            placeholder="lastname"
                            onChange={(e) => setProfile({ ...profile, lastname: e.target.value })}
                        />
                        </>
                    :
                        <>
                        <p>{profile.firstname} {profile.lastname}</p>
                        </>
                    }
                </div>
                <div className="user-location" onClick={() => handleUpdateProfile()}>
                    {updateProfile ?
                    <>
                        <textarea
                            className="user-city"
                            rows={1}
                            value={profile.city}
                            placeholder="city"
                            onChange={(e) => setProfile({ ...profile, city: e.target.value })}
                        />
                        <textarea
                            className="user-state"
                            rows={1}
                            value={profile.state}
                            placeholder="state"
                            onChange={(e) => setProfile({ ...profile, state: e.target.value })}
                        />
                    </>
                    :
                        <p>{profile.city}, {profile.state}</p>
                    }
                </div>
                {!updateProfile && selectedMedium && (
                    <div
                        className="portfolio-view-toggle"
                        onClick={(e) => { e.stopPropagation(); handlePortfolioView(); }}
                    >
                        portfolio view
                    </div>
                )}
                {!updateProfile && (canMail || profile.is_owner) && (
                    <div className="profile-action-row">
                        {canMail && (
                            <button
                                className="profile-mail-btn"
                                title={profile.is_owner ? "your messages" : `message ${profile.firstname || profile.username}`}
                                onClick={(e) => { e.stopPropagation(); handleMail(); }}
                            >
                                ✉
                                {profile.is_owner && unread > 0 && <span className="profile-mail-dot" />}
                            </button>
                        )}
                        {profile.is_owner && (
                            <button
                                className="profile-mail-btn"
                                title="settings"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setGearAnchor({ x: e.clientX, y: e.clientY });
                                }}
                            >
                                ⚙
                            </button>
                        )}
                    </div>
                )}
            </div>
            <div className="user-field-element" onClick={() => handleUpdateProfile()}>
                {updateProfile ? 
                    <>
                    <b className="artist-statement-label">artist statement</b>
                    <textarea      
                        rows={11}
                        value={profile.bio}
                        placeholder="write a bio"                                                                                                                      
                        onChange={(e) => setProfile({ ...profile, bio: e.target.value })}                                                           
                    />
                    </>
                :
                    <>
                    <span className="artist-statement-label">Artist Statement</span>
                    <hr></hr>
                    <p className="user-bio">{profile.bio}</p>
                    </>
                }
            </div>
            {updateProfile && <div className="submit-profile" onClick={() => handleSumbitProfile()}>submit</div>}

            <ContextPopup
                open={gearAnchor !== null}
                anchor={gearAnchor}
                onClose={() => setGearAnchor(null)}
            >
                {auth?.currentRole === "admin" && (
                    <button
                        className="context-popup-row"
                        onClick={() => { setGearAnchor(null); navigate("/admin"); }}
                    >
                        admin
                    </button>
                )}
                {auth?.currentRole !== "admin" && (
                    <button
                        className="context-popup-row"
                        onClick={() => { setGearAnchor(null); setShowDeleteAccount(true); }}
                    >
                        delete acc
                    </button>
                )}
                <button
                    className="context-popup-row"
                    onClick={() => { setGearAnchor(null); setConfirmLogout(true); }}
                >
                    logout
                </button>
            </ContextPopup>

            {confirmLogout && (
                <ConfirmDialog
                    message="log out?"
                    confirmLabel="logout"
                    cancelLabel="stay"
                    onConfirm={() => {
                        setConfirmLogout(false);
                        auth?.logout();
                        navigate("/landing-page");
                    }}
                    onCancel={() => setConfirmLogout(false)}
                />
            )}

            <DeleteAccountDialog
                open={showDeleteAccount}
                username={profile.username}
                onClose={() => setShowDeleteAccount(false)}
                onDeleted={() => {
                    auth?.logout();
                    navigate("/landing-page");
                }}
            />
        </div>
    )
}

export default UserInfo;