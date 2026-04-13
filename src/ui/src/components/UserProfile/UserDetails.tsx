import { Profile, upload_profile_picture } from "../../api";
import { Dispatch, SetStateAction, useRef, useState } from 'react';
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgSrc = profile.profile_pic_path
    ? `${profile.profile_pic_path}?v=${Date.now()}`
    : `/imgs/${profile.id}.png`;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const token = sessionStorage.getItem("token");
    const result = await upload_profile_picture(file, token);
    setProfile({ ...profile, profile_pic_path: result.profile_pic_path });
  };

  return (
    <>
    {isZoomedIn &&
      <ArtZoomIn
        isOwner={profile.is_owner}
        imgPath={imgSrc}
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

        <div className="user-profile-pic">
          <img
            src={imgSrc}
            width="180"
            height="200"
            onClick={() => setIsZoomedIn(true)}
          />
          {profile.is_owner && (
            <>
              <button onClick={() => fileInputRef.current?.click()}>change pic</button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                style={{ display: "none" }}
                onChange={handleUpload}
              />
            </>
          )}
        </div>
      </div>

    </div>
    </>
  );
};

export default UserDetails;
