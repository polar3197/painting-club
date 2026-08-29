import { useNavigate } from "react-router-dom";
import "../../styles/about.css";

export const ABOUT_SECTIONS = [
  { key: "ethos", label: "ethos", bg: "rgb(13, 43, 107)", fg: "#fff" }, // phthalo blue
  { key: "art", label: "art", bg: "rgb(251, 236, 93)", fg: "#000" },    // cadmium yellow light
  { key: "aims", label: "aims", bg: "rgb(229, 60, 57)", fg: "#fff" },   // bright warm red
] as const;

// "about the app" hub, copied from iOS: three full-width painted panels
// (ethos / art / aims) that together fill the page.
export default function About() {
  const navigate = useNavigate();
  return (
    <main className="page about-page">
      <button className="back-btn" onClick={() => navigate("/home")}>‹ back</button>
      <h1 className="about-title">about painting club</h1>
      <div className="about-panels">
        {ABOUT_SECTIONS.map((s) => (
          <button key={s.key} className="about-panel" style={{ backgroundColor: s.bg, color: s.fg }} onClick={() => navigate(`/about/${s.key}`)}>
            {s.label}
          </button>
        ))}
      </div>
    </main>
  );
}
