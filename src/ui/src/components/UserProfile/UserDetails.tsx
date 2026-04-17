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
  const [imgFailed, setImgFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgSrc = profile.profile_pic_path
    ? `${profile.profile_pic_path}?v=${Date.now()}`
    : `/imgs/${profile.id}.png`;
  // Start with the small placeholder thumb for instant paint; swap to the full-res
  // original once it finishes preloading in the background.
  const [displaySrc, setDisplaySrc] = useState(
    profile.profile_pic_path ? profileThumbUrl(profile.id) : imgSrc,
  );

  useEffect(() => { setImgFailed(false); }, [imgSrc]);

  useEffect(() => {
    if (!profile.profile_pic_path) {
      setDisplaySrc(imgSrc);
      return;
    }
    setDisplaySrc(profileThumbUrl(profile.id));
    const full = new Image();
    full.onload = () => setDisplaySrc(imgSrc);
    full.src = imgSrc;
  }, [profile.id, profile.profile_pic_path, imgSrc]);

  const handleUpload = async (file: File) => {
    const token = localStorage.getItem("token");
    const result = await upload_profile_picture(file, token);
    setProfile({ ...profile, profile_pic_path: result.profile_pic_path });
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await handleUpload(file);
  };

  const showEmpty = imgFailed;

  return (
    <>
    {isZoomedIn && !showEmpty &&
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

        {!showEmpty ? (
          <div className="user-profile-pic" onClick={() => setIsZoomedIn(true)}>
            <img
              src={displaySrc}
              width="180"
              height="200"
              onError={() => setImgFailed(true)}
              // @ts-ignore — fetchpriority isn't in the standard React img types yet
              fetchpriority="high"
            />
          </div>
        ) : (
          <div className="user-profile-pic empty-pic">
            {profile.is_owner ? (
              <>
                <button
                  className="change-pic-btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  add pic
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/heic,image/heif,.heic,.heif"
                  style={{ display: "none" }}
                  onChange={handleFileInput}
                />
              </>
            ) : (
              <span className="empty-pic-label">no pic</span>
            )}
          </div>
        )}
      </div>

    </div>
    </>
  );
};

export default UserDetails;
