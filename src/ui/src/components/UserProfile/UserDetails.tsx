import { Profile } from "../../api";
import { Dispatch, SetStateAction } from 'react';
import "../../styles/user-profile/user-deets.css";

const UserDetails = (
  { profile, setProfile, editMode, setEditMode } 
  : 
  { 
    profile: Profile, 
    setProfile: Dispatch<SetStateAction<Profile | null>>
    editMode : boolean, 
    setEditMode : Dispatch<SetStateAction<boolean>>
  }
  ) => {

  const handleEdit = () => {
    if (editMode) {
      // logic to persist profile changes back to DB
    }
    setEditMode(!editMode)
  };

  return (
    <div className="user-deets">
      
      <div className="top-bar">
        <p>@{profile.username}</p>
        {profile.is_owner && 
          <div className="edit-button" onClick={handleEdit}>
            {editMode ? "submit edit" : "edit"}
          </div>
        }
      </div>
      <div className="user-body">
        
        {editMode ? 
          <div className="user-fields">
            <div style={{ display: "flex", gap: "0.5rem" }}> 
              <textarea 
                name="firstname" 
                value={`${profile.firstname}`}
                onChange={(e) => setProfile((prev) => prev ? { ...prev, firstname: e.target.value } : prev)}
              />
              <textarea 
                name="lastname" 
                value={`${profile.lastname}`}
                onChange={(e) => setProfile((prev) => prev ? { ...prev, lastname: e.target.value } : prev)}
              />
            </div>
            <textarea 
              name="bio" 
              value={`${profile.bio}`}
              onChange={(e) => setProfile((prev) => prev ? { ...prev, bio: e.target.value } : prev)}
              rows={9}
            />
          </div>
          :
          <div className="user-fields">
            <p>{profile.firstname} {profile.lastname}</p>
            <p>{profile.bio}</p>
          </div>    
        }

        <div className="user-profile-pic">
          <img src={`/imgs/${profile.username}.png`} width="180" height="200"/>
        </div>
      </div>

    </div>
  );
};

export default UserDetails;
