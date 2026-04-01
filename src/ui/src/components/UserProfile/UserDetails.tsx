import { Profile } from "../../api";
import { Dispatch, SetStateAction, useState } from 'react';
import ArtZoomIn from "../Utils/ArtZoomIn";
import UserInfo from "./UserInfo";
import "../../styles/user-profile/user-deets.css";

const UserDetails = (
  { profile, setProfile } 
  : 
  { 
    profile: Profile, 
    setProfile: Dispatch<SetStateAction<Profile | null>>
  }
  ) => {

  const [isZoomedIn, setIsZoomedIn] = useState(false);

  return (
    <>
    {isZoomedIn && 
      <ArtZoomIn 
        isOwner={profile.is_owner}
        imgPath={`/imgs/${profile.username}.png`} 
        setIsZoomedIn={setIsZoomedIn}
      />
    }
    
    <div className="user-deets">
      <div className="user-body">
        <UserInfo 
          profile={profile}
          setProfile={setProfile}
        />

        <div className="user-profile-pic" onClick={() => setIsZoomedIn(true)}>
          <img src={`/imgs/${profile.username}.png`} width="180" height="200"/>
        </div>
      </div>

    </div>
    </>
  );
};

export default UserDetails;
