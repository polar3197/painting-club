import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "../../styles/weekly-prompt.css";
import { get_prompt, list_prompts, add_new_visual_2d, get_members_visual_2d, get_media, PromptDetailOut, PromptSummary, Visual2DIn, Visual2DOut, MediaType } from "../../api";
import ArtImage from "../Utils/ArtImage";
import AddArtDialog from "../Utils/AddArtDialog";
import ProposePromptDialog from "../Utils/ProposePromptDialog";
import SubmissionLightbox from "../Utils/SubmissionLightbox";
import { useAuth } from "../../context/AuthContext";
import { swr, invalidateCached } from "../../cache";
import "../../styles/utils/dialog.css";

// The prompt page: the submissions as one scrolling strip of images; click
// one to zoom, with ← → through the rest. Adding your art and proposing
// next week's prompt live here (the home column is just a gallery).
const WeeklyPromptGrid = () => {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token, currentUser } = useAuth()!;
  const [prompt, setPrompt] = useState<PromptDetailOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  // Editing: the viewer's own submission, fetched in full so the dialog opens
  // pre-filled (title, medium, image). Creating on an any-medium prompt first
  // asks which medium the piece belongs to.
  const [editingPiece, setEditingPiece] = useState<Visual2DOut | null>(null);
  const [createMedium, setCreateMedium] = useState<string | null>(null);
  const [pickingMedium, setPickingMedium] = useState(false);
  const [visualMedia, setVisualMedia] = useState<MediaType[]>([]);
  const [showPropose, setShowPropose] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [past, setPast] = useState<PromptSummary[]>([]);

  const refresh = useCallback(() => {
    if (!id) return Promise.resolve();
    return swr(`prompt:${id}`, () => get_prompt(id, token), setPrompt)
      .catch((e) => setError(e?.message || "Could not load prompt"));
  }, [id, token]);
  useEffect(() => { refresh(); }, [refresh]);

  const onCreateSubmission = (payload: Visual2DIn) => {
    if (!prompt) return;
    add_new_visual_2d(token, { ...payload, collection_id: prompt.id })
      .then(() => { setShowDialog(false); refresh(); })
      .catch((err) => alert((err as Error).message || "could not submit"));
  };

  const mySubmission = prompt?.submissions.find((s) => s.id === prompt.viewer_submission_id) ?? null;

  const onEditOwn = async () => {
    if (!mySubmission || !currentUser) return;
    try {
      const mine = await get_members_visual_2d(currentUser, mySubmission.medium);
      const full = mine.find((p) => p.id === mySubmission.id);
      if (!full) throw new Error("could not find your piece");
      setEditingPiece(full);
    } catch (err) {
      alert((err as Error).message || "could not open your submission");
    }
  };

  const onAddArt = () => {
    if (prompt?.media_name) { setCreateMedium(prompt.media_name); setShowDialog(true); return; }
    setPickingMedium(true);
    if (visualMedia.length === 0) get_media().then((m) => setVisualMedia(m.filter((x) => x.type === "visual_2d"))).catch(() => {});
  };

  const afterEdit = () => {
    setEditingPiece(null);
    if (currentUser) invalidateCached(`art:${currentUser}`);
    refresh();
  };

  const openPast = () => {
    setShowPast(true);
    if (past.length === 0) list_prompts(token).then(setPast).catch(() => {});
  };

  if (error) return <main className="page weekly-prompt-grid-page"><div className="weekly-prompt-error">{error}</div></main>;
  if (!prompt) return <main className="page weekly-prompt-grid-page"><div className="weekly-prompt-loading">loading…</div></main>;

  const subs = prompt.submissions;

  return (
    <main className="page weekly-prompt-grid-page">
      <button className="back-btn" onClick={() => navigate("/home")}>‹ back</button>
      <div className="weekly-prompt-grid-header">
        <div className="weekly-prompt-grid-heading">
          <span className="weekly-prompt-grid-kicker">{prompt.is_active ? "this week's prompt" : "past prompt"}</span>
          <span className="weekly-prompt-grid-title">{prompt.title}{prompt.media_name ? ` (${prompt.media_name})` : ""}</span>
          {prompt.short_summary && <span className="weekly-prompt-grid-summary">{prompt.short_summary}</span>}
        </div>
        <div className="weekly-prompt-grid-actions">
          {prompt.is_active && (prompt.viewer_submission_id
            ? <button className="wp-btn wp-btn-gold" onClick={onEditOwn}>edit your submission</button>
            : <button className="wp-btn wp-btn-gold" onClick={onAddArt}>add your art</button>)}
          <button className="wp-btn" onClick={() => setShowPropose(true)}>propose next week's</button>
          <button className="wp-btn wp-btn-plain" onClick={openPast}>past prompts</button>
        </div>
      </div>

      {pickingMedium && (
        <div className="wp-medium-pick">
          <span className="wp-medium-pick-label">which medium is your piece?</span>
          {visualMedia.length === 0 ? <span className="weekly-prompt-empty">loading…</span> : visualMedia.map((m) => (
            <button key={m.id} className="wp-btn" onClick={() => { setCreateMedium(m.name); setPickingMedium(false); setShowDialog(true); }}>{m.name}</button>
          ))}
          <button className="wp-btn wp-btn-plain" onClick={() => setPickingMedium(false)}>cancel</button>
        </div>
      )}

      {/* The art box fills the rest of the page; the strip sits centred in it. */}
      <div className="wp-art-box">
        <div className="wp-strip">
          {subs.length > 0 ? subs.map((s, i) => (
            <button key={s.id} className="wp-thumb" title={`${s.title} · @${s.creator_username}`} onClick={() => setZoom(i)}>
              <ArtImage artId={s.id} fullSrc={s.file_path} alt={s.title} className="wp-thumb-img" />
            </button>
          )) : <p className="weekly-prompt-empty">no submissions yet{prompt.is_active ? " — be the first" : ""}.</p>}
        </div>
      </div>

      {zoom !== null && <SubmissionLightbox pieces={subs} index={zoom} onIndex={setZoom} onClose={() => setZoom(null)} />}
      {showDialog && currentUser && createMedium && (
        <AddArtDialog setShowDialog={setShowDialog} selectedMedium={createMedium} username={currentUser} onSuccess={refresh} onCreate={onCreateSubmission} />
      )}
      {editingPiece && currentUser && mySubmission && (
        <AddArtDialog
          setShowDialog={(v) => { if (!v) setEditingPiece(null); }}
          selectedMedium={mySubmission.medium}
          username={currentUser}
          piece={editingPiece}
          onSuccess={afterEdit}
          onMoved={() => {}}
        />
      )}
      {showPropose && <ProposePromptDialog onClose={() => setShowPropose(false)} />}
      {showPast && (
        <div className="wp-modal-backdrop" onClick={() => setShowPast(false)}>
          <div className="dialog wp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="exit"><button onClick={() => setShowPast(false)}>x</button></div>
            <h2 className="wp-modal-title">past prompts</h2>
            <div className="wp-modal-list">
              {past.length === 0 ? <p className="weekly-prompt-empty">no prompts yet</p> : past.map((p) => (
                <button key={p.id} className={`wp-past-row ${p.id === prompt.id ? "current" : ""}`} disabled={p.id === prompt.id}
                  onClick={() => { setShowPast(false); navigate(`/prompts/${p.id}/grid`); }}>
                  <span className="wp-past-title">{p.title}</span>
                  <span className={`wp-past-date ${p.is_active ? "live" : ""}`}>
                    {new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default WeeklyPromptGrid;
