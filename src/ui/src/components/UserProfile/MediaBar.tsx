
import { Dispatch, SetStateAction, useState } from "react";
import { Profile, add_member_media } from "../../api";
import Dropdown from "../Utils/Dropdown";
import AddMediaDialog from "../Utils/AddMediaDialog";
import "../../styles/user-profile/media-bar.css";
import { useAuth } from "../../context/AuthContext";

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
    selectedMedium: string | null;
    setSelectedMedium: Dispatch<SetStateAction<string | null>>;
    selectedKeywords: string[];
    setSelectedKeywords: Dispatch<SetStateAction<string[]>>;
    availableKeywords: string[];
  }
) => {
  const [showAddMedia, setShowAddMedia] = useState(false);
  const { token } = useAuth()!;
  const noMedia = (profile.media?.length ?? 0) === 0;

  const handleAddMedia = async (name: string) => {
    try {
      await add_member_media(profile.username, name, token);
      setProfile({ ...profile, media: [...(profile.media ?? []), name] });
      setSelectedMedium(name);
      setSelectedKeywords([]);
    } catch (err: any) {
      alert(err?.message || "failed to add media");
    }
  };

  const handleVisibilityChange = (name: string, hiddenNow: boolean) => {
    const media = [...(profile.media ?? [])];
    const hidden = [...(profile.hidden_media ?? [])];
    if (hiddenNow) {
      const i = media.indexOf(name);
      if (i >= 0) media.splice(i, 1);
      if (!hidden.includes(name)) hidden.push(name);
    } else {
      const i = hidden.indexOf(name);
      if (i >= 0) hidden.splice(i, 1);
      if (!media.includes(name)) media.push(name);
    }
    setProfile({ ...profile, media, hidden_media: hidden });
    if (hiddenNow && selectedMedium === name) {
      setSelectedMedium(media[0] ?? null);
      setSelectedKeywords([]);
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
            aria-label="add or hide artforms"
          >
            +/-
          </button>
        )}
      </div>
      {selectedMedium && (
        <Keywords
          availableKeywords={availableKeywords}
          selectedMedium={selectedMedium}
          selectedKeywords={selectedKeywords}
          setSelectedKeywords={setSelectedKeywords}
        />
      )}
      {showAddMedia && (
        <AddMediaDialog
          shown={profile.media ?? []}
          hidden={profile.hidden_media ?? []}
          onAdd={handleAddMedia}
          onVisibilityChange={handleVisibilityChange}
          onClose={() => setShowAddMedia(false)}
        />
      )}
    </div>
  );
};

export default MediaBar;
