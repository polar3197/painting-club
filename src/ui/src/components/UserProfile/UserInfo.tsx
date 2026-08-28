import { Dispatch, SetStateAction, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Profile, update_profile } from "../../api";
import "../../styles/user-profile/user-deets.css";
import "../../styles/portfolio.css";
import { useAuth } from "../../context/AuthContext";
import { useAdminPending } from "../../hooks/useAdminPending";
import { GearIcon, PencilIcon, PaperPlaneIcon } from "../Utils/Icons";
import ShareMediaDialog from "../Utils/ShareMediaDialog";


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
    const [showShare, setShowShare] = useState(false);
    const { token } = useAuth()!;
    const navigate = useNavigate();
    const adminPending = useAdminPending();

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
                {/* Owner actions, same set as the iOS profile: settings,
                    edit, share. (Messages joins this row when it lands.) */}
                {profile.is_owner && !updateProfile && (
                    <div className="owner-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                            className="owner-action-btn"
                            aria-label="settings"
                            title="settings"
                            onClick={() => navigate("/settings")}
                        >
                            <GearIcon />
                            {adminPending.total > 0 && <span className="owner-action-dot" />}
                        </button>
                        <button
                            className="owner-action-btn"
                            aria-label="edit profile"
                            title="edit profile"
                            onClick={() => setUpdateProfile(true)}
                        >
                            <PencilIcon />
                        </button>
                        <button
                            className="owner-action-btn"
                            aria-label="share a portfolio"
                            title="share a portfolio"
                            onClick={() => setShowShare(true)}
                        >
                            <PaperPlaneIcon />
                        </button>
                    </div>
                )}
            </div>
            {showShare && (
                <ShareMediaDialog
                    username={profile.username}
                    media={profile.media ?? []}
                    onClose={() => setShowShare(false)}
                />
            )}
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
        </div>
    )
}

export default UserInfo;