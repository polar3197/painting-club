import { Outlet, useNavigate } from "react-router-dom";
import "../../styles/page-layout.css";

// Every page outside the hub. The hub (/home) is the only navigation; the way
// back to it from anywhere is the green "home" band down the left edge — the
// same band the hub's panels carry. (The old sidebar lives in ui/legacy/.)
const PageLayout = () => {
  const navigate = useNavigate();
  return (
    <div className="page-wrapper">
      <button className="home-band" onClick={() => navigate("/home")} aria-label="home">
        <span className="home-band-word">{"home".split("").map((ch, i) => <span key={i}>{ch}</span>)}</span>
      </button>
      <div id="page-body" className="page-body">
        <Outlet />
      </div>
    </div>
  );
};

export default PageLayout;
