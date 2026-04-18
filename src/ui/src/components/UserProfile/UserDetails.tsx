import { Profile, upload_profile_picture, profileThumbUrl } from "../../api";
import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';
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
  const hasPic = !!profile.profile_pic_path;
  const imgSrc = hasPic ? `${profile.profile_pic_path}?v=${Date.now()}` : "";
  // Start with the small placeholder thumb for instant paint; swap to the full-res
  // original once it finishes preloading in the background.
  const [displaySrc, setDisplaySrc] = useState(
    hasPic ? profileThumbUrl(profile.id) : "",
  );

  useEffect(() => {
    if (!hasPic) return;
    setDisplaySrc(profileThumbUrl(profile.id));
    const full = new Image();
    full.onload = () => setDisplaySrc(imgSrc);
    full.src = imgSrc;
  }, [profile.id, profile.profile_pic_path, imgSrc, hasPic]);

  const handleUpload = async (file: File) => {
    const token = localStorage.getItem("token");
    const result = await upload_profile_picture(file, token);
    setProfile({ ...profile, profile_pic_path: result.profile_pic_path });
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await handleUpload(file);
  };

  return (
    <>
    {isZoomedIn && hasPic &&
      <ArtZoomIn
        isOwner={profile.is_owner}
        imgPath={imgSrc}
        setIsZoomedIn={setIsZoomedIn}
        onChangePic={profile.is_owner ? handleUpload : undefined}
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
              src={displaySrc}
              width="180"
              height="200"
              // @ts-ignore — fetchpriority isn't in the standard React img types yet
              fetchpriority="high"
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
