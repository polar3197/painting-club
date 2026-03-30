
import { useState } from 'react';
import { useMembers } from "../../hooks/useMembers";
import { Profile } from "../../api";
import { useNavigate } from "react-router-dom";
import Filters from "../Profiles/Filters";
import "../../styles/profiles/members-display.css";
import "../../styles/profiles/filters.css";

const MemberCard = (
  { member } : { member : Profile }
) => {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/members/${member.username}/profile`);
  }

  return (
    <div className='member-card' onClick={handleClick}>
      <div className='member-deets'>
        <p>@{member.username}</p>
        <p>{member.firstname} {member.lastname}</p>
        <p>{member.city}</p>
      </div>
      <div className='member-pic'>
        <img src={`/imgs/${member.username}.png`} width="130" height="155"/>
      </div>
    </div>
  );
};

const Profiles = () => {
  const [city, setCity] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [members, error, loading] = useMembers(city, username);

  return (
    <>
    <Filters 
      setUsername={setUsername}
      setCity={setCity}
    />
    <div className='members-display'>
      {(members.length > 0) ? 
        members.map(member => (
          <MemberCard key={member.username} member={member} />
        ))
        :
        <p>No members found :(</p>
      }
    </div>
    </>
  );
};

export default Profiles;
