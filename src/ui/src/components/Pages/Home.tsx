import { useNavigate } from "react-router-dom";
import { useAdminPending } from "../../hooks/useAdminPending";
import PromptColumn from "../Home/PromptColumn";
import "../../styles/app-layout.css";
import "../../styles/home.css";

// Home, pared back for now: the title, then the week's prompt full width at
// the golden section of the page. Events moved to the sidebar; the feature
// board (Home/FeatureBoard) and the About bookshelf (Home/Bulletin) are
// unmounted but kept for their return.
export default function Home() {
  const navigate = useNavigate();
  const adminPending = useAdminPending();

  return (
    <main className="page">
      <div className="home">
        <div className="home-top">
          <div className="home-title">-• Paint Club •-</div>
          {adminPending.total > 0 && (
            <button className="home-admin-alert" onClick={() => navigate("/admin")}>
              {adminPending.total} {adminPending.total === 1 ? "request" : "requests"} to review
            </button>
          )}
        </div>
        <div className="home-space-above" />
        <PromptColumn />
        <div className="home-space-below" />
      </div>
    </main>
  );
}
