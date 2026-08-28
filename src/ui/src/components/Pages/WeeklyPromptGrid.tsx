import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import "../../styles/profiles/members-display.css";
import "../../styles/weekly-prompt.css";
import { get_prompt, PromptDetailOut, ArtResult } from "../../api";
import ArtImage from "../Utils/ArtImage";
import { useAuth } from "../../context/AuthContext";

const ArtCard = ({ piece }: { piece: ArtResult }) => {
  const navigate = useNavigate();
  return (
    <div
      className="display-card art-card"
      onClick={() => navigate(`/members/${piece.creator_username}/profile?artId=${piece.id}&medium=${encodeURIComponent(piece.medium)}`)}
    >
      <div className="art-card-img">
        <ArtImage artId={piece.id} fullSrc={piece.file_path} alt={piece.title} />
      </div>
      <div className="art-card-deets">
        <p><b>{piece.title}</b></p>
        <p>{piece.medium}</p>
        <p className="art-card-creator">@{piece.creator_username}</p>
      </div>
    </div>
  );
};

const WeeklyPromptGrid = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState<PromptDetailOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { token } = useAuth()!;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    get_prompt(id, token)
      .then((p) => { if (!cancelled) setPrompt(p); })
      .catch((e) => { if (!cancelled) setError(e?.message || "Could not load prompt"); });
    return () => { cancelled = true; };
  }, [id, token]);

  if (error) {
    return <main className="page weekly-prompt-page"><div className="weekly-prompt-error">{error}</div></main>;
  }
  if (!prompt) {
    return <main className="page weekly-prompt-page"><div className="weekly-prompt-loading">loading…</div></main>;
  }

  return (
    <main className="page weekly-prompt-grid-page">
      <div className="weekly-prompt-grid-header">
        <button
          className="weekly-prompt-grid-back"
          onClick={() => navigate(`/prompts/${prompt.id}`)}
        >
          ← back
        </button>
        <div className="weekly-prompt-grid-title">{prompt.title}</div>
      </div>
      <div className="members-display">
        {prompt.submissions.length > 0
          ? prompt.submissions.map((s) => <ArtCard key={s.id} piece={s} />)
          : <p>No submissions yet.</p>
        }
      </div>
    </main>
  );
};

export default WeeklyPromptGrid;
