import { Dispatch, SetStateAction } from "react";
import { useNavigate } from "react-router-dom";
import { Profile } from "../../api";
import "../../styles/user-profile/user-deets.css";
import "../../styles/portfolio.css";

// Name, location, portfolio-view link and the artist statement. Editing
// happens on /edit-profile (pencil in the action stack beside the picture).
const UserInfo = ({ profile, selectedMedium, selectedKeywords }: {
    profile: Profile;
    setProfile: Dispatch<SetStateAction<Profile | null>>;
    selectedMedium: string | null;
    selectedKeywords: string[];
}) => {
    const navigate = useNavigate();

    const handlePortfolioView = () => {
        if (!selectedMedium) return;
        const params = new URLSearchParams({ medium: selectedMedium });
        if (selectedKeywords.length > 0) params.set("keywords", selectedKeywords.join(","));
        navigate(`/members/${profile.username}/portfolio?${params.toString()}`);
    };

    return (
        <div className="user-fields">
            <div className="user-identity">
                <div className="user-name"><p>{profile.firstname} {profile.lastname}</p></div>
                <div className="user-location"><p>{[profile.city, profile.state].filter(Boolean).join(", ")}</p></div>
                {selectedMedium && (
                    <div className="portfolio-view-toggle" onClick={handlePortfolioView}>portfolio view</div>
                )}
            </div>
            <div className="user-field-element">
                <span className="artist-statement-label">Artist Statement</span>
                <hr></hr>
                <p className="user-bio">{profile.bio}</p>
            </div>
        </div>
    )
}

export default UserInfo;
