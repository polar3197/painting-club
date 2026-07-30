import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Portfolio, PortfolioPiece,
  get_my_portfolio, get_my_portfolio_pieces, set_art_visibility,
  add_portfolio_block, update_portfolio_block, delete_portfolio_block, set_portfolio_block_pieces,
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
      <main className="pe-canvas">
        {portfolio.blocks.map((block) => (
          <div
            key={block.id}
            className="pe-block"
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault();
              if (!token) return;
              const artId = e.dataTransfer.getData("text/art-id");
              const fromBlock = e.dataTransfer.getData("text/block-id");
              if (artId && (block.kind === "gallery" || block.kind === "spotlight")) {
                if (block.piece_ids.includes(artId)) return;
                const piece = pieces.find((p) => p.id === artId);
                if (piece && piece.visibility !== "public") {
                  await set_art_visibility(token, artId, "public");
                  setPieces((ps) => ps.map((p) => (p.id === artId ? { ...p, visibility: "public" } : p)));
                }
                reload(await set_portfolio_block_pieces(token, block.id, [...block.piece_ids, artId]));
              } else if (fromBlock && fromBlock !== block.id) {
                const other = portfolio.blocks.find((b) => b.id === fromBlock);
                if (!other) return;
                await update_portfolio_block(token, fromBlock, { position: block.position });
                reload(await update_portfolio_block(token, block.id, { position: other.position }));
              }
            }}
          >
            <div className="pe-block-head">
              <span
                className="pe-block-handle"
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/block-id", block.id)}
              >⠿</span>
              <span className="pe-block-kind">{block.kind}</span>
              {block.kind === "gallery" && (
                <select
                  value={block.config.layout ?? "grid"}
                  onChange={async (e) =>
                    token && reload(await update_portfolio_block(token, block.id, {
                      config: { ...block.config, layout: e.target.value },
                    }))
                  }
                >
                  <option value="grid">grid</option>
                  <option value="single">single column</option>
                </select>
              )}
              {block.kind === "statement" && (
                <textarea
                  defaultValue={block.config.text ?? ""}
                  placeholder="artist statement (blank = your bio)"
                  onBlur={async (e) =>
                    token && reload(await update_portfolio_block(token, block.id, {
                      config: { ...block.config, text: e.target.value },
                    }))
                  }
                />
              )}
              <button
                className="pe-block-delete"
                onClick={async () => token && reload(await delete_portfolio_block(token, block.id))}
              >×</button>
            </div>
            {(block.kind === "gallery" || block.kind === "spotlight") && (
              <div className="pe-block-pieces">
                {block.piece_ids.map((pid, idx) => {
                  const piece = pieces.find((p) => p.id === pid);
                  return (
                    <div
                      key={pid}
                      className="pe-block-piece"
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        e.dataTransfer.setData("text/reorder", `${block.id}:${idx}`);
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={async (e) => {
                        e.stopPropagation();
                        const data = e.dataTransfer.getData("text/reorder");
                        if (!data || !token) return;
                        const [srcBlock, srcIdxStr] = data.split(":");
                        if (srcBlock !== block.id) return;
                        const ids = [...block.piece_ids];
                        const [moved] = ids.splice(Number(srcIdxStr), 1);
                        ids.splice(idx, 0, moved);
                        reload(await set_portfolio_block_pieces(token, block.id, ids));
                      }}
                    >
                      {piece?.file_path && <img src={piece.file_path} alt={piece?.title ?? ""} />}
                      <button
                        onClick={async () =>
                          token && reload(await set_portfolio_block_pieces(
                            token, block.id, block.piece_ids.filter((x) => x !== pid),
                          ))
                        }
                      >remove</button>
                    </div>
                  );
                })}
                {block.piece_ids.length === 0 && <div className="pe-block-empty">drop pieces here</div>}
              </div>
            )}
          </div>
        ))}
        <div className="pe-add-block">
          {(["gallery", "spotlight", "statement"] as const).map((kind) => (
            <button key={kind} onClick={async () => token && reload(await add_portfolio_block(token, kind))}>
              + {kind}
            </button>
          ))}
        </div>
      </main>
      <aside className="pe-side">{/* Task 11: theme + publish */}</aside>
    </div>
  );
}
