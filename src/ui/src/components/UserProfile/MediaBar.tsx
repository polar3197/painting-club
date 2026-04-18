
import { Dispatch, SetStateAction, useState } from "react";
import { Profile, add_member_media } from "../../api";
import Dropdown from "../Utils/Dropdown";
import AddMediaDialog from "../Utils/AddMediaDialog";
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
  { profile, setProfile, selectedMedium, setSelectedMedium, selectedKeywords, setSelectedKeywords, availableKeywords }:
  {
    profile: Profile;
    setProfile: Dispatch<SetStateAction<Profile | null>>;
    selectedMedium: string;
    setSelectedMedium: Dispatch<SetStateAction<string | null>>;
    selectedKeywords: string[];
    setSelectedKeywords: Dispatch<SetStateAction<string[]>>;
    availableKeywords: string[];
  }
) => {
  const [showAddMedia, setShowAddMedia] = useState(false);
  const noMedia = (profile.media?.length ?? 0) === 0;

  const handleAddMedia = async (name: string) => {
    const token = localStorage.getItem("token");
    try {
      await add_member_media(profile.username, name, token);
      setProfile({ ...profile, media: [...(profile.media ?? []), name] });
      setSelectedMedium(name);
      setSelectedKeywords([]);
    } catch (err: any) {
      alert(err?.message || "failed to add media");
    }
  };

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
        {profile.is_owner && (
          <button
            type="button"
            className={`add-media ${noMedia ? "add-media--full" : ""}`}
            onClick={() => setShowAddMedia(true)}
            aria-label="add artform"
          >
            +
          </button>
        )}
      </div>
      <Keywords
        availableKeywords={availableKeywords}
        selectedMedium={selectedMedium}
        selectedKeywords={selectedKeywords}
        setSelectedKeywords={setSelectedKeywords}
      />
      {showAddMedia && (
        <AddMediaDialog
          existing={profile.media ?? []}
          onPick={handleAddMedia}
          onClose={() => setShowAddMedia(false)}
        />
      )}
    </div>
  );
};

export default MediaBar;
