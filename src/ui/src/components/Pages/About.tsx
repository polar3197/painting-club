import { useNavigate } from "react-router-dom";
import "../../styles/about.css";

// Painter's palette: each section is a tint inside a fuller-strength border.
export const ABOUT_SECTIONS = [
  { key: "ethos", label: "ethos", bg: "rgb(122, 162, 224)", border: "rgb(13, 43, 107)", fg: "#000" }, // light phthalo in phthalo blue
  { key: "art", label: "art", bg: "rgb(251, 236, 93)", border: "rgb(255, 193, 0)", fg: "#000" },                 // cad yellow light in cad yellow medium
  { key: "aims", label: "aims", bg: "rgb(244, 130, 100)", border: "rgb(229, 60, 57)", fg: "#000" },              // cad red light in cad red
] as const;

// "about the app" hub, copied from iOS: three full-width painted panels
// (ethos / art / aims) that together fill the page.
export default function About() {
  const navigate = useNavigate();
  return (
    <main className="page about-page">
      <button className="back-btn" onClick={() => navigate("/home")}>‹ back</button>
      <h1 className="about-title">about paint club</h1>
      <div className="about-panels">
        {ABOUT_SECTIONS.map((s) => (
          <button key={s.key} className="about-panel" style={{ backgroundColor: s.bg, color: s.fg, borderColor: s.border }} onClick={() => navigate(`/about/${s.key}`)}>
            {s.label}
          </button>
        ))}
      </div>
    </main>
  );
}
