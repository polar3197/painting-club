import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { DocOut, get_docs_by_section } from "../../api";
import { ToolsPage } from "../Utils/ToolsPage";
import { ABOUT_SECTIONS } from "./About";

// One About section: the list of its docs. Any member reads; contributors
// get "+" to add one and edit/delete from the doc page.
export default function AboutSection() {
  const { section = "" } = useParams<{ section: string }>();
  const navigate = useNavigate();
  const { token, currentRole } = useAuth()!;
  const [docs, setDocs] = useState<DocOut[] | null>(null);
  const label = ABOUT_SECTIONS.find((s) => s.key === section)?.label ?? section;
  const emptyText = section === "art" ? "currently artless" : section === "aims" ? "currently aimless" : "nothing here yet";

  const load = useCallback(() => get_docs_by_section(section, token).then(setDocs).catch(() => setDocs([])), [section, token]);
  useEffect(() => { load(); }, [load]);

  return (
    <ToolsPage
      title={label}
      contributorOnly={false}
      onBack={() => navigate("/home")}
      action={currentRole === "contributor" && <button className="add-btn" onClick={() => navigate(`/about/${section}/new`)}>+ doc</button>}
    >
      {docs === null ? <p className="tools-empty">loading…</p>
        : docs.length === 0 ? <p className="tools-empty">{emptyText}</p>
        : docs.map((d) => (
          <button key={d.slug} className="tools-row" onClick={() => navigate(`/about/doc/${d.slug}`)}>
            <span className="tools-row-main">
              <span className="tools-row-title">{d.title}</span>
              {d.body && <span className="tools-row-body">{d.body}</span>}
            </span>
          </button>
        ))}
    </ToolsPage>
  );
}
