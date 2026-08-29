import { useNavigate } from "react-router-dom";
import { useAdminPending } from "../../hooks/useAdminPending";
import { ABOUT_SECTIONS } from "../Pages/About";

// Top-left of Home: the title, then "about the app" as a bookshelf — the
// three sections (ethos / art / aims) standing as spines; click one to open
// it, or the shelf's header for the About hub.
export default function Bulletin() {
  const navigate = useNavigate();
  const adminPending = useAdminPending();

  return (
    <div className="bulletin">
      <div className="home-top">
        <div className="home-title">-• Paint Club •-</div>
        {adminPending.total > 0 && (
          <button className="home-admin-alert" onClick={() => navigate("/admin")}>
            {adminPending.total} {adminPending.total === 1 ? "request" : "requests"} to review
          </button>
        )}
      </div>

      <section className="shelf">
        <button className="shelf-head" onClick={() => navigate("/about")}>
          <span className="home-square-label">about the app</span>
          <span className="home-square-link">open ›</span>
        </button>
        <div className="shelf-books">
          {ABOUT_SECTIONS.map((s) => (
            <button key={s.key} className="shelf-book" style={{ backgroundColor: s.bg, color: s.fg }} onClick={() => navigate(`/about/${s.key}`)}>
              {s.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
