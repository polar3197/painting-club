
import { Dispatch, SetStateAction } from "react";
import { Profile } from "../../api";
import "../../styles/user-profile/media-bar.css";

const MediaBar = (
  { profile, selectedMedium, setSelectedMedium }: 
  { profile: Profile; selectedMedium : string | null; setSelectedMedium: Dispatch<SetStateAction<string | null>> }
) => {
  return (
    <div className="media-bar">
      {profile.media.map((medium) => (
        <div 
          onClick={() => setSelectedMedium(medium)} 
          key={medium} 
          className={`media-element ${medium == selectedMedium ? "selected" : ""}`}
        >
          {medium}
        </div>
      ))}
    </div>
  );
};

export default MediaBar;
