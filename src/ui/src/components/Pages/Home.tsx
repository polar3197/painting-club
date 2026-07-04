import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import "../../styles/app-layout.css";
import "../../styles/home.css";
import { get_active_prompt, PromptOut } from "../../api";

export default function Home() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState<PromptOut | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    let cancelled = false;
    get_active_prompt(token)
      .then((p) => { if (!cancelled) setPrompt(p); })
      .catch(() => { if (!cancelled) setPrompt(null); });
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="page">
      <div className="home">
        <div className="home-left">
          <div className="home-left-top">
            <div className="home-left-title">-• Painting Club •-</div>
          </div>
          <div className="home-left-content">
            {prompt ? (
              <button
                className="prompt-banner"
                onClick={() => navigate(`/prompts/${prompt.id}`)}
              >
                <div className="prompt-banner-label">this week's prompt</div>
                <div className="prompt-banner-title">{prompt.title}</div>
                <div className="prompt-banner-medium">medium: {prompt.media_name}</div>
              </button>
            ) : (
              <div className="prompt-banner-empty">no prompt this week</div>
            )}
          </div>
        </div>
        <div className="home-right">
            <div className="painting-club-message">
              <p>Welcome to Painting Club.</p>
              <br></br>
              <p>I built this space for artists to share their art.</p>
              <br></br>
              <p>The goal is to center art around sincerity.</p>
              <br></br>
              <p>I truly believe you see a person's intent in every brush stroke - and I am sure this goes for other mediums too. If the intention is sincere then it is good.</p>
              <br></br>
              <p>As AI learns to keep up and outperform all artists the only metric worth grading art on is sincerity. So Painting Club is here to foster that community.</p>
              <br></br>
              <p>It is a random fun spot for art, a place to inspire and be inspired by others</p>
              <br></br>
              <p>— its also been my longtime secret hope for there to be an internet platform safe from predatory algorithms and warped value systems.</p>
              <br></br>
              <div className="stamp-wrapper">
                <img src='/imgs/groups.png' width='120px'></img>
              </div>
            </div>
          </div>
      </div>
    </main>
  );
}
