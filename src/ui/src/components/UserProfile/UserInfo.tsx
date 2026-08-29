import { Profile } from "../../api";
import OwnerActions from "./OwnerActions";
import "../../styles/user-profile/user-deets.css";

// Two cells of the header row: the identity column (name, location, the
// action buttons stacked beneath) and the artist statement. The picture is
// the third cell, rendered by UserDetails.
const UserInfo = ({ profile }: { profile: Profile }) => (
    <>
        <div className="user-col">
            <div className="user-identity">
                <div className="user-name"><p>{profile.firstname} {profile.lastname}</p></div>
                <div className="user-location"><p>{[profile.city, profile.state].filter(Boolean).join(", ")}</p></div>
            </div>
            <OwnerActions profile={profile} />
        </div>
        <div className="user-field-element">
            <span className="artist-statement-label">Artist Statement</span>
            <hr></hr>
            <p className="user-bio">{profile.bio}</p>
        </div>
    </>
);

export default UserInfo;
