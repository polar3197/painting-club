import { useNavigate } from "react-router-dom";
import { useAdminPending } from "../../hooks/useAdminPending";
import PromptColumn from "../Home/PromptColumn";
import StampBanner from "../Home/StampBanner";
import EventsBox from "../Home/EventsBox";
import FeatureBoard from "../Home/FeatureBoard";
import BookShelf from "../Home/BookShelf";
import "../../styles/app-layout.css";
import "../../styles/home.css";

// Home: the title; the week's prompt full width with its centre at the golden
// section; and beneath it a band with events, the feature-request board and
// the About bookshelf, each sized to what it shows. Every proportion is a
// knob at the top of home.css.
export default function Home() {
  const navigate = useNavigate();
  const adminPending = useAdminPending();

  return (
    <main className="page">
      <div className="home">
        <div className="home-top">
          <StampBanner />
          {adminPending.total > 0 && (
            <button className="home-admin-alert" onClick={() => navigate("/admin")}>
              {adminPending.total} {adminPending.total === 1 ? "request" : "requests"} to review
            </button>
          )}
        </div>
        <PromptColumn />
        <div className="home-below">
          <EventsBox />
          <FeatureBoard />
          <BookShelf />
        </div>
      </div>
    </main>
  );
}
