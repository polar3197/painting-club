import { useNavigate } from "react-router-dom";
import { useFeatureRequests } from "../../hooks/useFeatureRequests";
import FeatureRequestRow from "../Utils/FeatureRequestRow";

// Bulletin widget: the feature-request board in a box — pinned header, the
// list scrolling inside, votes right here. "open ›" goes to the full page
// (where requests are added and deleted).
export default function FeatureBoard() {
  const navigate = useNavigate();
  const { requests, vote } = useFeatureRequests();

  return (
    <section className="fr-board">
      <div className="fr-board-head">
        <span className="fr-board-label">requests for the app</span>
        <button className="home-square-link" onClick={() => navigate("/request-feature")}>open ›</button>
      </div>
      <div className="fr-board-list">
        {requests === null ? <p className="fr-empty">loading…</p>
          : requests.length === 0 ? <p className="fr-empty">nothing requested yet.</p>
          : requests.map((r) => <FeatureRequestRow key={r.id} r={r} onVote={vote} />)}
      </div>
    </section>
  );
}
