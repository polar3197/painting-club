
import { Dispatch, SetStateAction } from "react";
import { Profile } from "../../api";
import Dropdown from "../Utils/Dropdown";
import "../../styles/user-profile/media-bar.css";

const Keywords = (
  { availableKeywords, selectedMedium, selectedKeywords, setSelectedKeywords } :
  {
    availableKeywords: string[];
    selectedMedium: string;
    selectedKeywords: string[];
    setSelectedKeywords: Dispatch<SetStateAction<string[]>>;
  }
) => {

  const handleSelect = (value: string) => {
    if (!selectedKeywords.includes(value)) {
      setSelectedKeywords(prev => [...prev, value]);
    }
  };

  const handleRemove = (value: string) => {
    setSelectedKeywords(prev => prev.filter(k => k !== value));
  };

  return (
    <div className="keywords-bar">
      <div className="keyword-select-wrapper">
        <Dropdown
          placeholder={`filter ${selectedMedium}`}
          options={availableKeywords.filter(k => !selectedKeywords.includes(k))}
          onSelect={handleSelect}
        />
      </div>
      <div className="keyword-bubbles-wrapper">
        {selectedKeywords.map(keyword => (
          <div key={keyword} className="bubble">
            <div className="bubble-name">{keyword}</div>
            <div className="bubble-x" onClick={() => handleRemove(keyword)}>x</div>
          </div>
        ))}
      </div>
    </div>
  )
}

const MediaBar = (
  { profile, selectedMedium, setSelectedMedium, selectedKeywords, setSelectedKeywords, availableKeywords }:
  {
    profile: Profile;
    selectedMedium: string;
    setSelectedMedium: Dispatch<SetStateAction<string | null>>;
    selectedKeywords: string[];
    setSelectedKeywords: Dispatch<SetStateAction<string[]>>;
    availableKeywords: string[];
  }
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
      <Keywords
        availableKeywords={availableKeywords}
        selectedMedium={selectedMedium}
        selectedKeywords={selectedKeywords}
        setSelectedKeywords={setSelectedKeywords}
      />
    </div>
  );
};

export default MediaBar;
