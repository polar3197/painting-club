import { useNavigate } from "react-router-dom";
import { ABOUT_SECTIONS } from "../Pages/About";

// "about paint club" as a bookshelf: the three sections (ethos / art / aims)
// standing as spines; each opens its own pages.
export default function BookShelf() {
  const navigate = useNavigate();
  return (
    <section className="shelf">
      <div className="shelf-head">
        <span className="home-square-label">about paint club</span>
      </div>
      <div className="shelf-books">
        {ABOUT_SECTIONS.map((s) => (
          <button key={s.key} className="shelf-book" style={{ backgroundColor: s.bg, color: s.fg }} onClick={() => navigate(`/about/${s.key}`)}>
            {s.label}
          </button>
        ))}
      </div>
    </section>
  );
}
