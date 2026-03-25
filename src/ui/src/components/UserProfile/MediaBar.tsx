
import { Dispatch, SetStateAction } from "react";
import { Profile } from "../../api";
import "../../styles/user-profile/media-bar.css";

const MediaBar = (
  { profile, setSelectedMedium }: 
  { profile: Profile; setSelectedMedium: Dispatch<SetStateAction<string | null>> }
) => {
  return (
    <div className="media-bar">
      {profile.media.map((medium) => (
        <div onClick={() => setSelectedMedium(medium)} key={medium} className="media-element" >
          {medium}
        </div>
      ))}
    </div>
  );
};

export default MediaBar;
