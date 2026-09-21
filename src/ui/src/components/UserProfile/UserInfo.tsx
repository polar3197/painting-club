import { Profile } from "../../api";
import OwnerActions from "./OwnerActions";
import CommentsReceivedPanel from "./CommentsReceivedPanel";
import "../../styles/user-profile/user-deets.css";

// Two cells of the header row: the identity column (name, location, the
// action buttons stacked beneath) and the artist statement. The picture is
// the third cell, rendered by UserDetails.
const UserInfo = ({ profile, onOpenComment }: { profile: Profile; onOpenComment?: (artId: string, medium: string) => void }) => (
    <>
        <div className="user-col">
            <div className="user-identity">
                <div className="user-name"><p>{profile.firstname} {profile.lastname}</p></div>
                <div className="user-location"><p>{[profile.city, profile.state].filter(Boolean).join(", ")}</p></div>
            </div>
            <OwnerActions profile={profile} />
        </div>
        {/* The owner can swipe the statement over to the comments they've
            received (phones; iOS carousel). Visitors just see the statement. */}
        <div className={`statement-strip${profile.is_owner ? " swipeable" : ""}`}>
            <div className="user-field-element">
                <span className="artist-statement-label">Artist Statement</span>
                <hr></hr>
                <p className="user-bio">{profile.bio}</p>
            </div>
            {profile.is_owner && onOpenComment && (
                <div className="user-field-element statement-comments">
                    <CommentsReceivedPanel onOpen={onOpenComment} />
                </div>
            )}
        </div>
    </>
);

export default UserInfo;
