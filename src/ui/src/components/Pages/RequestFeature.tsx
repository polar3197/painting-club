import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FeatureRequestOut } from "../../api";
import { useFeatureRequests } from "../../hooks/useFeatureRequests";
import FeatureRequestRow from "../Utils/FeatureRequestRow";
import ConfirmDialog from "../Utils/ConfirmDialog";
import "../../styles/utils/dialog.css";
import "../../styles/feature-requests.css";

// Feature-request board, from iOS: anonymous to members, up/down votes,
// the requester or staff can delete. Pinned header; the list scrolls.
export default function RequestFeature() {
  const navigate = useNavigate();
  const { requests, vote, add, remove, canDelete } = useFeatureRequests();
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [posting, setPosting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<FeatureRequestOut | null>(null);

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = newTitle.trim();
    if (!t || posting) return;
    setPosting(true);
    try { await add(t); setShowAdd(false); setNewTitle(""); }
    catch (err) { alert((err as Error).message || "could not post"); }
    finally { setPosting(false); }
  };

  return (
    <main className="page fr-page">
      <button className="back-btn" onClick={() => navigate("/home")}>‹ back</button>
      {pendingDelete && (
        <ConfirmDialog message={`delete "${pendingDelete.title}"?`} confirmLabel="delete" cancelLabel="keep it"
          onConfirm={() => { remove(pendingDelete); setPendingDelete(null); }} onCancel={() => setPendingDelete(null)} />
      )}
      {showAdd && (
        <div className="fr-backdrop" onClick={() => setShowAdd(false)}>
          <form className="dialog fr-dialog" onClick={(e) => e.stopPropagation()} onSubmit={submitAdd}>
            <div className="exit"><button type="button" onClick={() => setShowAdd(false)}>x</button></div>
            <h2 className="fr-dialog-title">request something for the app</h2>
            <input className="fr-input" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="what would you like?" autoFocus />
            <div className="fr-actions" style={{ justifyContent: "flex-end" }}>
              <button type="submit" className="fr-add" disabled={!newTitle.trim() || posting}>{posting ? "posting…" : "post"}</button>
            </div>
          </form>
        </div>
      )}
      <div className="fr-header">
        <h1 className="fr-page-title">request something for the app</h1>
        <button className="fr-add" onClick={() => setShowAdd(true)}>+ request</button>
      </div>
      <div className="fr-list">
        {requests === null ? <p className="fr-empty">loading…</p>
          : requests.length === 0 ? <p className="fr-empty">nothing requested yet — be the first.</p>
          : requests.map((r) => (
            <FeatureRequestRow key={r.id} r={r} onVote={vote} onDelete={canDelete(r) ? () => setPendingDelete(r) : undefined} />
          ))}
      </div>
    </main>
  );
}
