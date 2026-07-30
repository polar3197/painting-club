import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Portfolio, PortfolioPiece,
  get_my_portfolio, get_my_portfolio_pieces, set_art_visibility,
} from "../../api";
import "../../styles/portfolio-editor.css";

export default function PortfolioEditor() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [pieces, setPieces] = useState<PortfolioPiece[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      navigate("/not-a-member");
      return;
    }
    get_my_portfolio(token).then(setPortfolio).catch(() => setError("could not load portfolio"));
    get_my_portfolio_pieces(token).then(setPieces).catch(() => {});
  }, [token, navigate]);

  const reload = useCallback((p?: Portfolio) => {
    if (p) setPortfolio(p);
    else if (token) get_my_portfolio(token).then(setPortfolio).catch(() => {});
  }, [token]);

  const toggleVisibility = async (piece: PortfolioPiece) => {
    if (!token) return;
    const next = piece.visibility === "public" ? "club" : "public";
    try {
      await set_art_visibility(token, piece.id, next);
      setPieces((ps) => ps.map((p) => (p.id === piece.id ? { ...p, visibility: next } : p)));
      reload();
    } catch {
      alert("could not change visibility");
    }
  };

  if (error) return <div className="pe-error">{error}</div>;
  if (!portfolio) return <div className="pe-loading">loading…</div>;

  return (
    <div className="pe-root">
      <aside className="pe-palette">
        <h3>your pieces</h3>
        <div className="pe-palette-grid">
          {pieces.map((piece) => (
            <div
              key={piece.id}
              className={`pe-piece ${piece.visibility === "public" ? "pe-piece-public" : ""}`}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/art-id", piece.id)}
            >
              {piece.file_path && <img src={piece.file_path} alt={piece.title ?? ""} />}
              <button className="pe-vis-toggle" onClick={() => toggleVisibility(piece)}>
                {piece.visibility === "public" ? "public" : "club only"}
              </button>
            </div>
          ))}
        </div>
      </aside>
      <main className="pe-canvas">{/* Task 10: block stack */}</main>
      <aside className="pe-side">{/* Task 11: theme + publish */}</aside>
    </div>
  );
}
