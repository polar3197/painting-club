import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "../../styles/tab-bar.css";

// The web app's navigation: a bottom tab bar — profile, events, art wall,
// people — all with the app's own hand drawings (me / writing / art /
// profiles.png). Replaced the swipe hub on the web (archived in ui/legacy/).
export default function TabBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { currentUser } = useAuth()!;
  const mine = currentUser ? `/members/${currentUser}/profile` : "/not-a-member";

  const tabs = [
    { key: "profile", label: "profile", to: mine, icon: <img src="/imgs/me.png" alt="" />, active: pathname === mine },
    { key: "events", label: "events", to: "/events", icon: <img src="/imgs/writing.png" alt="" />, active: pathname === "/events" },
    { key: "wall", label: "art wall", to: "/art-wall", icon: <img src="/imgs/art.png" alt="" />, active: pathname === "/art-wall" },
    { key: "people", label: "people", to: "/members", icon: <img src="/imgs/profiles.png" alt="" />, active: pathname === "/members" },
  ];

  return (
    <nav className="tab-bar" aria-label="main">
      {tabs.map((t) => (
        <button
          key={t.key}
          className={`tab${t.active ? " on" : ""}`}
          aria-current={t.active ? "page" : undefined}
          onClick={() => {
            if (t.active) document.getElementById("page-body")?.scrollTo({ top: 0, behavior: "smooth" });
            else navigate(t.to);
          }}
        >
          <span className="tab-icon">{t.icon}</span>
          <span className="tab-label">{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
