import { Dispatch, SetStateAction } from "react";
import { Profile } from "../../api";
import "../../styles/user-profile/user-deets.css";
import "../../styles/portfolio.css";

// Name, location and the artist statement. Editing
// happens on /edit-profile (pencil in the action stack beside the picture).
const UserInfo = ({ profile }: {
    profile: Profile;
    setProfile: Dispatch<SetStateAction<Profile | null>>;
    selectedMedium: string | null;
    selectedKeywords: string[];
}) => {
    return (
        <div className="user-fields">
            <div className="user-identity">
                <div className="user-name"><p>{profile.firstname} {profile.lastname}</p></div>
                <div className="user-location"><p>{[profile.city, profile.state].filter(Boolean).join(", ")}</p></div>
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
