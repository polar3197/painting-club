import { Dispatch, SetStateAction, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Profile, update_profile, block_user, unblock_user } from "../../api";
import { useAuth } from "../../context/AuthContext";
import ContextPopup from "../Utils/ContextPopup";
import ConfirmDialog from "../Utils/ConfirmDialog";
import "../../styles/user-profile/user-deets.css";
import "../../styles/portfolio.css";


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
    const token = localStorage.getItem("token");
    const navigate = useNavigate();
    const auth = useAuth();
    const currentUser = auth?.currentUser ?? null;
    const blockedUsernames = auth?.blockedUsernames ?? [];
    const noteBlocked = auth?.noteBlocked ?? (() => {});
    const noteUnblocked = auth?.noteUnblocked ?? (() => {});

    const [popupAnchor, setPopupAnchor] = useState<{ x: number; y: number } | null>(null);
    const [pendingBlock, setPendingBlock] = useState<string | null>(null);
    const [pendingUnblock, setPendingUnblock] = useState<string | null>(null);

    const isBlocked = blockedUsernames.includes(profile.username);

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
        <div className="user-fields" style={{ position: "relative" }}>
            {!profile.is_owner && currentUser && (
                <button
                    className="profile-kebab"
                    aria-label="profile options"
                    onClick={(e) => setPopupAnchor({ x: e.clientX, y: e.clientY })}
                >
                    ⋮
                </button>
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
                        if (isBlocked) setPendingUnblock(profile.username);
                        else setPendingBlock(profile.username);
                    }}
                >
                    {isBlocked ? "unblock" : "block"} @{profile.username}
                </button>
            </ContextPopup>
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
        </div>
    )
}

export default UserInfo;