import { useState, useEffect } from 'react';
import Fuse from "fuse.js";
import { useOptions } from "../../hooks/useOptions";
import { ArtResult, search_art, thumbUrl } from "../../api";
import { useNavigate } from "react-router-dom";
import CentralFilter from "../Profiles/CentralFilter";
import "../../styles/profiles/members-display.css";

const ArtCard = ({ piece }: { piece: ArtResult }) => {
  const navigate = useNavigate();
  return (
    <div className='display-card art-card' onClick={() => navigate(`/members/${piece.creator_username}/profile?artId=${piece.id}&medium=${encodeURIComponent(piece.medium)}`)}>
      <div className='art-card-img'>
        <img src={thumbUrl(piece.id, 512)} alt={piece.title} />
      </div>
      <div className='art-card-deets'>
        <p><b>{piece.title}</b></p>
        <p>{piece.medium}</p>
        <p onClick={(e) => { e.stopPropagation(); navigate(`/members/${piece.creator_username}/profile`); }} className="art-card-creator">
          @{piece.creator_username}
        </p>
        {piece.location && <p>{piece.location}</p>}
        {piece.keywords.length > 0 && <p>{piece.keywords.join(", ")}</p>}
      </div>
    </div>
  );
};

const ArtGallery = () => {
  const [query, setQuery] = useState("");
  const [allArt, setAllArt] = useState<ArtResult[]>([]);
  const [options] = useOptions();

  useEffect(() => {
    search_art("").then(setAllArt).catch((e) => console.error("art fetch failed:", e));
  }, []);

  const artOptions = [...options.titles, ...options.songs, ...options.keywords].filter(Boolean);
  const fuse = new Fuse(allArt, { keys: ["title", "medium", "song", "creator_username", "location", "keywords"], threshold: 0.4 });
  const filtered = query ? fuse.search(query).map(r => r.item) : allArt;

  return (
    <>
      <CentralFilter header="art" options={artOptions} onSearch={setQuery} placeholder="search art..." />
      <div className='members-display'>
        {filtered.length > 0
          ? filtered.map(a => <ArtCard key={a.id} piece={a} />)
          : <p>No art found :(</p>
        }
      </div>
    </>
  );
};

export default ArtGallery;
