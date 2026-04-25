import { useState, useEffect } from 'react';
import Fuse from "fuse.js";
import { useOptions } from "../../hooks/useOptions";
import { ArtResult, search_art } from "../../api";
import { useNavigate } from "react-router-dom";
import CentralFilter from "../Profiles/CentralFilter";
import ArtImage from "../Utils/ArtImage";
import "../../styles/profiles/members-display.css";

const ArtCard = ({ piece }: { piece: ArtResult }) => {
  const navigate = useNavigate();
  return (
    <div className='display-card art-card' onClick={() => navigate(`/members/${piece.creator_username}/profile?artId=${piece.id}&medium=${encodeURIComponent(piece.medium)}`)}>
      <div className='art-card-img'>
        <ArtImage artId={piece.id} fullSrc={piece.file_path} alt={piece.title} />
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

const ART_KEYS = ["title", "medium", "song", "creator_username", "location", "keywords"];

const ArtGallery = () => {
  const [query, setQuery] = useState("");
  const [chips, setChips] = useState<string[]>([]);
  const [allArt, setAllArt] = useState<ArtResult[]>([]);
  const [options] = useOptions();

  useEffect(() => {
    search_art("").then(setAllArt).catch((e) => console.error("art fetch failed:", e));
  }, []);

  const artOptions = [...options.titles, ...options.songs, ...options.keywords, ...options.mediums, ...options.usernames, ...options.cities].filter(Boolean);

  let filtered: ArtResult[] = allArt;
  for (const chip of chips) {
    filtered = new Fuse(filtered, { keys: ART_KEYS, threshold: 0.4 }).search(chip).map(r => r.item);
  }
  if (query.trim()) {
    filtered = new Fuse(filtered, { keys: ART_KEYS, threshold: 0.4 }).search(query).map(r => r.item);
  }

  const addChip = (value: string) => setChips(prev => prev.includes(value) ? prev : [...prev, value]);
  const removeChip = (value: string) => setChips(prev => prev.filter(c => c !== value));

  return (
    <>
      <CentralFilter
        header="art"
        options={artOptions}
        chips={chips}
        onAddChip={addChip}
        onRemoveChip={removeChip}
        onQueryChange={setQuery}
        placeholder="search art..."
        bannerSrc="/imgs/art.png"
      />
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
