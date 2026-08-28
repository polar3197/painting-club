import { Profile, upload_profile_picture, profilePicSrc } from "../../api";
import { Dispatch, SetStateAction, useRef, useState } from 'react';
import { useAuth } from "../../context/AuthContext";
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
  const auth = useAuth();
  const versions = auth?.profilePicVersions ?? {};
  const src = profilePicSrc(profile, versions);
  const hasPic = !!src;

  const handleUpload = async (file: File) => {
    const token = localStorage.getItem("token");
    const result = await upload_profile_picture(file, token);
    setProfile({ ...profile, profile_pic_path: result.profile_pic_path });
    // Same-extension re-uploads write to the same URL — bump versions so corner
    // and zoom both refetch.
    auth?.bumpProfilePic(profile.id);
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await handleUpload(file);
  };

  return (
    <>
    {isZoomedIn && src &&
      <ArtZoomIn
        isOwner={profile.is_owner}
        imgPath={src}
        setIsZoomedIn={setIsZoomedIn}
        onChangePic={profile.is_owner ? handleUpload : undefined}
        blockableUsername={!profile.is_owner ? profile.username : undefined}
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

        {hasPic ? (
          <div className="user-profile-pic" onClick={() => setIsZoomedIn(true)}>
            <img
              src={src!}
              width="180"
              height="200"
              fetchPriority="high"
            />
          </div>
        ) : profile.is_owner ? (
          <div className="user-profile-pic empty-pic">
            <button
              className="add-pic-plus"
              onClick={() => fileInputRef.current?.click()}
            >
              add prof pic
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/heic,image/heif,.heic,.heif"
              style={{ display: "none" }}
              onChange={handleFileInput}
            />
          </div>
        ) : (
          <div className="user-profile-pic empty-pic" />
        )}
      </div>

    </div>
    </>
  );
};

export default UserDetails;
