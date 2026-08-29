import { useNavigate } from "react-router-dom";
import { useAdminPending } from "../../hooks/useAdminPending";
import Announcements from "../Utils/Announcements";

// Left third of Home: the club noticeboard — title, announcements, and the
// two app links the iOS home pins to its corners.
export default function Bulletin() {
  const navigate = useNavigate();
  const adminPending = useAdminPending();

  return (
    <div className="bulletin">
      <div className="home-top">
        <div className="home-title">-• Painting Club •-</div>
      </div>
      {adminPending.total > 0 && (
        <button className="home-admin-alert" onClick={() => navigate("/admin")}>
          {adminPending.total} {adminPending.total === 1 ? "request" : "requests"} to review
        </button>
      )}

      <Announcements />

      <div className="bulletin-links">
        <button className="bulletin-link" onClick={() => navigate("/about")}>about the app</button>
        <button className="bulletin-link" onClick={() => navigate("/request-feature")}>request something for the app</button>
      </div>
    </div>
  );
}
