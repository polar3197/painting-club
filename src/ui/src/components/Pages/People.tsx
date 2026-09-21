import { useState } from 'react';
import Fuse from "fuse.js";
import { useMembers } from "../../hooks/useMembers";
import { useOptions } from "../../hooks/useOptions";
import { Profile, profilePicThumbSrc } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";
import CentralFilter from "../Profiles/CentralFilter";
import "../../styles/profiles/members-display.css";
import "../../styles/profiles/people-grid.css";

const MemberCard = ({ member }: { member: Profile }) => {
  const navigate = useNavigate();
  const auth = useAuth();
  const versions = auth?.profilePicVersions ?? {};
  // No fallback image: a member without a picture gets blank space, not a
  // broken-image box.
  const src = profilePicThumbSrc(member, versions);

  return (
    <button className="people-card" onClick={() => navigate(`/members/${member.username}/profile`)}>
      <span className="people-card-pic">
        {src && <img src={src} alt="" loading="lazy" decoding="async" />}
      </span>
      <span className="people-card-name">{member.username}</span>
    </button>
  );
};

const PEOPLE_KEYS = ["username", "firstname", "lastname", "city", "media"];

const People = () => {
  const [query, setQuery] = useState("");
  const [chips, setChips] = useState<string[]>([]);
  const [members] = useMembers("", "");
  const [options] = useOptions();

  const peopleOptions = [...options.usernames, ...options.fullnames, ...options.cities, ...options.mediums].filter(Boolean);

  let filtered: Profile[] = members;
  for (const chip of chips) {
    filtered = new Fuse(filtered, { keys: PEOPLE_KEYS, threshold: 0.4 }).search(chip).map(r => r.item);
  }
  if (query.trim()) {
    filtered = new Fuse(filtered, { keys: PEOPLE_KEYS, threshold: 0.4 }).search(query).map(r => r.item);
  }

  const addChip = (value: string) => setChips(prev => prev.includes(value) ? prev : [...prev, value]);
  const removeChip = (value: string) => setChips(prev => prev.filter(c => c !== value));

  // Members with a picture first, then those without; newest to join first
  // within each group (accounts with no join date sort last).
  const ordered = [...filtered].sort((a, b) => {
    const picDiff = Number(!!b.profile_pic_path) - Number(!!a.profile_pic_path);
    if (picDiff) return picDiff;
    return (b.joined_at ?? "").localeCompare(a.joined_at ?? "");
  });

  return (
    <div className="people-page">
      <CentralFilter
        header="members"
        options={peopleOptions}
        chips={chips}
        onAddChip={addChip}
        onRemoveChip={removeChip}
        onQueryChange={setQuery}
        placeholder="search people..."
        bannerSrc="/imgs/profiles.png"
      />
      {/* iOS People pane: uniform cards four rows tall, scrolling sideways
          under the search bar; card size follows the space left. */}
      {filtered.length > 0 ? (
        <div className="people-strip">
          {ordered.map(m => <MemberCard key={m.username} member={m} />)}
        </div>
      ) : (
        <p className="people-empty">No people found :(</p>
      )}
    </div>
  );
};

export default People;
