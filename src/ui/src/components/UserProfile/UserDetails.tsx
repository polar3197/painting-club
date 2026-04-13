import { Profile } from "../../api";
import { Dispatch, SetStateAction, useState } from 'react';
import ArtZoomIn from "../Utils/ArtZoomIn";
import UserInfo from "./UserInfo";
import "../../styles/user-profile/user-deets.css";

const UserDetails = (
  { profile, setProfile, selectedMedium, selectedKeywords }
  :
  {
    profile: Profile,
    setProfile: Dispatch<SetStateAction<Profile | null>>;
    selectedMedium: string | null;
    selectedKeywords: string[];
  }
  ) => {

  const [isZoomedIn, setIsZoomedIn] = useState(false);

  return (
    <>
    {isZoomedIn && 
      <ArtZoomIn 
        isOwner={profile.is_owner}
        imgPath={`/imgs/${profile.id}.png`} 
        setIsZoomedIn={setIsZoomedIn}
      />
    }
    
    <div className="user-deets">
      <div className="user-body">
        <UserInfo
          profile={profile}
          setProfile={setProfile}
          selectedMedium={selectedMedium}
          selectedKeywords={selectedKeywords}
        />

        <div className="user-profile-pic" onClick={() => setIsZoomedIn(true)}>
          <img src={`/imgs/${profile.id}.png`} width="180" height="200"/>
        </div>
      </div>

    </div>
    </>
  );
};

export default UserDetails;
