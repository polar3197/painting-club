import { useState } from "react";
import { FeatureRequestOut } from "../../api";
import { useFeatureRequests } from "../../hooks/useFeatureRequests";
import FeatureRequestRow from "../Utils/FeatureRequestRow";
import ConfirmDialog from "../Utils/ConfirmDialog";

// Bulletin widget: the whole feature-request board — pinned header with
// "+ request", the list scrolling inside, votes in place. Adding happens
// right here (a form row at the top of the list), and the requester or
// staff can delete from a row's kebab. There's no separate page.
export default function FeatureBoard() {
  const { requests, vote, add, remove, canDelete } = useFeatureRequests();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [posting, setPosting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<FeatureRequestOut | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t || posting) return;
    setPosting(true);
    try { await add(t); setTitle(""); setAdding(false); }
    catch (err) { alert((err as Error).message || "could not post"); }
    finally { setPosting(false); }
  };

  return (
    <section className="fr-board">
      {pendingDelete && (
        <ConfirmDialog message={`delete "${pendingDelete.title}"?`} confirmLabel="delete" cancelLabel="keep it"
          onConfirm={() => { remove(pendingDelete); setPendingDelete(null); }} onCancel={() => setPendingDelete(null)} />
      )}
      <div className="fr-board-head">
        <span className="fr-board-label">requests for the app</span>
        <button className="add-btn" onClick={() => setAdding((a) => !a)}>{adding ? "cancel" : "+ request"}</button>
      </div>
      <div className="fr-board-list">
        {adding && (
          <form className="fr-add-row" onSubmit={submit}>
            <input className="fr-add-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="what would you like?" autoFocus
              onKeyDown={(e) => { if (e.key === "Escape") setAdding(false); }} />
            <button type="submit" className="add-btn" disabled={!title.trim() || posting}>{posting ? "posting…" : "post"}</button>
          </form>
        )}
        {requests === null ? <p className="fr-empty">loading…</p>
          : requests.length === 0 && !adding ? <p className="fr-empty">nothing requested yet.</p>
          : requests.map((r) => (
            <FeatureRequestRow key={r.id} r={r} onVote={vote} onDelete={canDelete(r) ? () => setPendingDelete(r) : undefined} />
          ))}
      </div>
    </section>
  );
}
