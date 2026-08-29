import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { FeatureRequestOut, get_feature_requests, create_feature_request, vote_feature_request, delete_feature_request } from "../../api";
import { ToolsPage } from "../Utils/ToolsPage";
import ConfirmDialog from "../Utils/ConfirmDialog";
import "../../styles/utils/dialog.css";
import "../../styles/feature-requests.css";

// Optimistic vote math mirroring the server: same direction retracts,
// opposite direction switches.
function applyVote(r: FeatureRequestOut, value: 1 | -1): FeatureRequestOut {
  const next = { ...r };
  if (r.my_vote === value) {
    next.my_vote = null;
    if (value === 1) next.up -= 1; else next.down -= 1;
  } else {
    if (r.my_vote === 1) next.up -= 1;
    if (r.my_vote === -1) next.down -= 1;
    next.my_vote = value;
    if (value === 1) next.up += 1; else next.down += 1;
  }
  return next;
}

// Feature-request board, from iOS: anonymous to members, up/down votes,
// the requester or an admin can delete.
export default function RequestFeature() {
  const navigate = useNavigate();
  const { token, currentRole } = useAuth()!;
  const [requests, setRequests] = useState<FeatureRequestOut[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [posting, setPosting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<FeatureRequestOut | null>(null);

  const load = useCallback(() => get_feature_requests(token).then(setRequests).catch(() => setRequests((r) => r ?? [])), [token]);
  useEffect(() => { load(); }, [load]);

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = newTitle.trim();
    if (!t || posting) return;
    setPosting(true);
    try { const created = await create_feature_request(t, token); setRequests((prev) => [created, ...(prev ?? [])]); setShowAdd(false); setNewTitle(""); }
    catch (err) { alert((err as Error).message || "could not post"); }
    finally { setPosting(false); }
  };

  const vote = (id: string, value: 1 | -1) => {
    setRequests((prev) => (prev ?? []).map((r) => (r.id === id ? applyVote(r, value) : r)));
    vote_feature_request(id, value, token)
      .then((tally) => setRequests((prev) => (prev ?? []).map((r) => (r.id === id ? { ...r, ...tally } : r))))
      .catch(load); // out of sync — refetch the truth
  };

  const confirmDelete = async () => {
    const target = pendingDelete;
    if (!target) return;
    setPendingDelete(null);
    setRequests((prev) => (prev ?? []).filter((r) => r.id !== target.id));
    try { await delete_feature_request(target.id, token); } catch { load(); }
  };

  const canDelete = (r: FeatureRequestOut) => r.is_owner || currentRole === "admin" || currentRole === "contributor";

  return (
    <ToolsPage title="request something for the app" contributorOnly={false} onBack={() => navigate("/home")}
      action={<button className="tools-btn" onClick={() => setShowAdd(true)}>+ request</button>}>
      {pendingDelete && (
        <ConfirmDialog message={`delete "${pendingDelete.title}"?`} confirmLabel="delete" cancelLabel="keep it" onConfirm={confirmDelete} onCancel={() => setPendingDelete(null)} />
      )}
      {showAdd && (
        <div className="hp-modal-backdrop fr-backdrop" onClick={() => setShowAdd(false)}>
          <form className="dialog fr-dialog" onClick={(e) => e.stopPropagation()} onSubmit={submitAdd}>
            <div className="exit"><button type="button" onClick={() => setShowAdd(false)}>x</button></div>
            <h2 className="fr-dialog-title">request something for the app</h2>
            <input className="fr-input" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="what would you like?" autoFocus />
            <div className="tools-row-actions" style={{ justifyContent: "flex-end" }}>
              <button type="submit" className="tools-btn" disabled={!newTitle.trim() || posting}>{posting ? "posting…" : "post"}</button>
            </div>
          </form>
        </div>
      )}
      {requests === null ? <p className="tools-empty">loading…</p>
        : requests.length === 0 ? <p className="tools-empty">nothing requested yet — be the first.</p>
        : requests.map((r) => (
          <div key={r.id} className="fr-row">
            <div className="fr-main">
              <span className="fr-title">{r.title}</span>
              {r.username && <span className="tools-row-meta">@{r.username}</span>}
            </div>
            <div className="fr-votes">
              <button className={`fr-vote ${r.my_vote === 1 ? "on" : ""}`} onClick={() => vote(r.id, 1)}>↑ {r.up}</button>
              <button className={`fr-vote ${r.my_vote === -1 ? "on" : ""}`} onClick={() => vote(r.id, -1)}>↓ {r.down}</button>
              {canDelete(r) && <button className="fr-delete" onClick={() => setPendingDelete(r)} aria-label="delete">×</button>}
            </div>
          </div>
        ))}
    </ToolsPage>
  );
}
