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

const People = () => {
  const [query, setQuery] = useState("");
  const [members] = useMembers("", "");
  const [options] = useOptions();

  const peopleOptions = [...options.usernames, ...options.fullnames, ...options.cities, ...options.mediums].filter(Boolean);
  const fuse = new Fuse(members, { keys: ["username", "firstname", "lastname", "city", "media"], threshold: 0.4 });
  const filtered = query ? fuse.search(query).map(r => r.item) : members;

  return (
    <>
      <CentralFilter header={"members"} options={peopleOptions} onSearch={setQuery} placeholder="search people..." />
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
