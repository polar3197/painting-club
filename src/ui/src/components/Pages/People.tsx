import { useState } from 'react';
import Fuse from "fuse.js";
import { useMembers } from "../../hooks/useMembers";
import { useOptions } from "../../hooks/useOptions";
import { Profile } from "../../api";
import { useNavigate } from "react-router-dom";
import CentralFilter from "../Profiles/CentralFilter";
import "../../styles/profiles/members-display.css";

const MemberCard = ({ member }: { member: Profile }) => {
  const navigate = useNavigate();
  return (
    <div className='display-card member-card' onClick={() => navigate(`/members/${member.username}/profile`)}>
      <div className='member-deets'>
        <p>@{member.username}</p>
        <p>{member.firstname} {member.lastname}</p>
        <p>{member.city}, {member.state}</p>
        {member.media && member.media.length > 0 && (
          <p className="member-mediums">{member.media.join(", ")}</p>
        )}
      </div>
      <div className='member-pic'>
        <img src={(member.profile_pic_path || `/imgs/${member.id}.png`)} width="130" height="155"/>
      </div>
    </div>
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

  return (
    <>
      <CentralFilter
        header="members"
        options={peopleOptions}
        chips={chips}
        onAddChip={addChip}
        onRemoveChip={removeChip}
        onQueryChange={setQuery}
        placeholder="search people..."
      />
      <div className='members-display'>
        {filtered.length > 0
          ? filtered.map(m => <MemberCard key={m.username} member={m} />)
          : <p>No people found :(</p>
        }
      </div>
    </>
  );
};

export default People;
