import { Dispatch, SetStateAction, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Profile, update_profile } from "../../api";
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
                    />
                    </>
                :
                    <>
                    <p>{profile.firstname} {profile.lastname}</p>
                    </>
                }
                {selectedMedium && (
                    <div
                        className="portfolio-view-toggle"
                        onClick={(e) => { e.stopPropagation(); handlePortfolioView(); }}
                    >
                        portfolio view
                    </div>
                )}
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
            <br></br>
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