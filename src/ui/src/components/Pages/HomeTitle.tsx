import { useNavigate } from "react-router-dom";
import "../../styles/pages-nav.css";

// Home: just the title (iOS parity); tapping it opens the docs.
export default function HomeTitle() {
  const navigate = useNavigate();
  return (
    <div className="home-title-page">
      <button className="home-title-box" onClick={() => navigate("/about")}>paint club</button>
    </div>
  );
}
