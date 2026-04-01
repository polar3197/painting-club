
import { Dispatch, SetStateAction } from "react";
import { Profile } from "../../api";
import Dropdown from "../Utils/Dropdown";
import "../../styles/user-profile/media-bar.css";

const Keywords = (
  { selectedMedium } : {selectedMedium : string; }
) => {
  const bubbles = ["bubble1", "bubble2", "bubble3"];

  return (
    <div className="keywords">
      <div className="keyword-select-wrapper">
        <Dropdown placeholder={`filter ${selectedMedium}`}/>
      </div>
      <div className="keyword-bubbles-wrapper">
        {bubbles.map(bubble_name => (
          <div className="bubble">
            <div className="bubble-name" key={bubble_name}>
              {bubble_name}
            </div>
            <div className="bubble-x">x</div>
          </div>
        ))}
      </div>
    </div>
  )
}

const MediaBar = (
  { profile, selectedMedium, setSelectedMedium }: 
  { profile: Profile; selectedMedium : string; setSelectedMedium: Dispatch<SetStateAction<string | null>> }
) => {
  return (
    <div className="media-bar-wrapper">
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
      <Keywords selectedMedium={selectedMedium}/>
    </div>
  );
};

export default MediaBar;
