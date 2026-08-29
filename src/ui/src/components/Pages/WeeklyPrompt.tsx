import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import "../../styles/weekly-prompt.css";
import { get_prompt, add_new_visual_2d, PromptDetailOut, ArtResult, Visual2DIn } from "../../api";
import ArtImage from "../Utils/ArtImage";
import AddArtDialog from "../Utils/AddArtDialog";
import { useAuth } from "../../context/AuthContext";
import { swr } from "../../cache";

// Compute the (cols, rows) that maximizes the per-tile area inside (W, H) for N items.
// Tries every column count and picks the layout whose min(W/cols, H/rows) is largest.
function bestGridLayout(W: number, H: number, N: number): { cols: number; rows: number } {
  if (N <= 0) return { cols: 1, rows: 1 };
  let best = { cols: 1, rows: N, size: 0 };
  for (let cols = 1; cols <= N; cols++) {
    const rows = Math.ceil(N / cols);
    const size = Math.min(W / cols, H / rows);
    if (size > best.size) best = { cols, rows, size };
  }
  return { cols: best.cols, rows: best.rows };
}

const PromptMosaic = ({ submissions, onClick }: { submissions: ArtResult[]; onClick: () => void }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{ cols: number; rows: number }>({ cols: 1, rows: 1 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const W = el.clientWidth;
      const H = el.clientHeight;
      if (!W || !H) return;
      setLayout(bestGridLayout(W, H, submissions.length));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [submissions.length]);

  return (
    <div ref={containerRef} className="prompt-mosaic" onClick={onClick}>
      <div
        className="prompt-mosaic-grid"
        style={{
          gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
          gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
        }}
      >
        {submissions.map((s) => (
          <div key={s.id} className="prompt-mosaic-cell">
            <ArtImage artId={s.id} fullSrc={s.file_path} alt="" className="prompt-mosaic-img" />
          </div>
        ))}
      </div>
    </div>
  );
};

const WeeklyPrompt = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState<PromptDetailOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const { token, currentUser } = useAuth()!;

  const refresh = () => {
    if (!id) return;
    get_prompt(id, token)
      .then(setPrompt)
      .catch((e) => setError(e?.message || "Could not load prompt"));
  };

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    swr(`prompt:${id}`, () => get_prompt(id, token), (p) => { if (!cancelled) setPrompt(p); })
      .catch((e) => { if (!cancelled) setError(e?.message || "Could not load prompt"); });
    return () => { cancelled = true; };
  }, [id, token]);

  const username = currentUser ?? "";

  const onCreateSubmission = (payload: Visual2DIn) => {
    if (!prompt) return;
    add_new_visual_2d(token, { ...payload, collection_id: prompt.id })
      .then(() => { setShowDialog(false); refresh(); })
      .catch((err: any) => alert(err?.message || "Could not submit"));
  };

  const onEditOwn = () => {
    if (!prompt || !prompt.viewer_submission_id || !username) return;
    navigate(`/members/${username}/profile?artId=${prompt.viewer_submission_id}&medium=${encodeURIComponent(prompt.media_name)}`);
  };

  if (error) {
    return <main className="page weekly-prompt-page"><div className="weekly-prompt-error">{error}</div></main>;
  }
  if (!prompt) {
    return <main className="page weekly-prompt-page"><div className="weekly-prompt-loading">loading…</div></main>;
  }

  return (
    <main className="page weekly-prompt-page">
      <div className="weekly-prompt-left">
        <div className="weekly-prompt-header">
          <div className="weekly-prompt-heading">week's prompt</div>
          <div className="weekly-prompt-title">{prompt.title}</div>
          {prompt.short_summary && (
            <div className="weekly-prompt-summary">{prompt.short_summary}</div>
          )}
          <div className="weekly-prompt-medium">medium: {prompt.media_name}</div>
        </div>

        {prompt.viewer_submission_id ? (
          <div className="weekly-prompt-already">
            <div>you've submitted to this prompt</div>
            <button className="weekly-prompt-edit-link" onClick={onEditOwn}>
              edit your piece →
            </button>
          </div>
        ) : (
          <button
            className="weekly-prompt-drop-frame"
            onClick={() => setShowDialog(true)}
          >
            drop your art here
          </button>
        )}
      </div>

      <div className="weekly-prompt-right">
        {prompt.submissions.length === 0 ? (
          <div className="weekly-prompt-empty">be the first to submit</div>
        ) : (
          <PromptMosaic
            submissions={prompt.submissions}
            onClick={() => navigate(`/prompts/${prompt.id}/grid`)}
          />
        )}
      </div>

      {showDialog && username && (
        <AddArtDialog
          setShowDialog={setShowDialog}
          selectedMedium={prompt.media_name}
          username={username}
          onSuccess={refresh}
          onCreate={onCreateSubmission}
        />
      )}
    </main>
  );
};

export default WeeklyPrompt;
