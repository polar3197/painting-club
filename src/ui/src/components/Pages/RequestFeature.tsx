import { useEffect, useState, FormEvent } from "react";
import {
  FeatureRequestOut,
  create_feature_request,
  delete_feature_request,
  get_feature_requests,
  vote_feature_request,
} from "../../api";
import { useAuth } from "../../context/AuthContext";
import ConfirmDialog from "../Utils/ConfirmDialog";
import "../../styles/requests.css";

export default function RequestFeature() {
  const auth = useAuth();
  const token = localStorage.getItem("token");
  const isAdmin = auth?.currentRole === "admin";
  const [requests, setRequests] = useState<FeatureRequestOut[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<FeatureRequestOut | null>(null);

  const refresh = () => {
    get_feature_requests(token)
      .then(setRequests)
      .catch(() => {})
      .finally(() => setLoaded(true));
  };

  useEffect(refresh, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Optimistic vote math mirroring the server rules: same direction retracts,
  // opposite direction switches. Refetch on error to reconcile.
  const handleVote = async (r: FeatureRequestOut, value: 1 | -1) => {
    setRequests((prev) =>
      prev.map((req) => {
        if (req.id !== r.id) return req;
        let { up, down, my_vote } = req;
        if (my_vote === value) {
          if (value === 1) up -= 1;
          else down -= 1;
          my_vote = null;
        } else {
          if (my_vote === 1) up -= 1;
          if (my_vote === -1) down -= 1;
          if (value === 1) up += 1;
          else down += 1;
          my_vote = value;
        }
        return { ...req, up, down, my_vote };
      }),
    );
    try {
      await vote_feature_request(r.id, value, token);
    } catch {
      refresh();
    }
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const text = title.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      const created = await create_feature_request(text, token);
      setRequests((prev) => [created, ...prev]);
      setTitle("");
      setShowForm(false);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    const target = confirmDelete;
    setConfirmDelete(null);
    if (!target) return;
    setRequests((prev) => prev.filter((r) => r.id !== target.id));
    try {
      await delete_feature_request(target.id, token);
    } catch {
      refresh();
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="requests-page">
      <div className="requests-header">
        <h2>requests for the app</h2>
        <button className="requests-new-btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "nevermind" : "+ new request"}
        </button>
      </div>

      {showForm && (
        <form className="requests-form" onSubmit={handleCreate}>
          <input
            placeholder="what should the app do?"
            value={title}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
          />
          <button type="submit" disabled={!title.trim() || submitting}>
            {submitting ? "posting..." : "post"}
          </button>
        </form>
      )}

      <div className="requests-list">
        {!loaded && <p className="requests-muted">loading...</p>}
        {loaded && requests.length === 0 && (
          <p className="requests-muted">nothing yet — ask for something</p>
        )}
        {requests.map((r) => (
          <div key={r.id} className="request-row">
            <div className="request-main" onClick={() => toggleExpand(r.id)}>
              <div className={`request-title ${expanded.has(r.id) ? "" : "clamped"}`}>{r.title}</div>
              {r.username != null && <div className="request-requester">@{r.username}</div>}
            </div>
            <div className="request-votes">
              <button
                className={`vote-btn ${r.my_vote === 1 ? "active" : ""}`}
                onClick={() => handleVote(r, 1)}
              >
                ▲ {r.up}
              </button>
              <button
                className={`vote-btn ${r.my_vote === -1 ? "active" : ""}`}
                onClick={() => handleVote(r, -1)}
              >
                ▼ {r.down}
              </button>
              {(r.is_owner || isAdmin) && (
                <button
                  className="request-delete"
                  title="delete request"
                  onClick={() => setConfirmDelete(r)}
                >
                  ×
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          message="delete this request?"
          confirmLabel="delete"
          cancelLabel="keep it"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
