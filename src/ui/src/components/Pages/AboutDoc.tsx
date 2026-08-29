import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { DocOut, get_doc, create_doc, update_doc, delete_doc } from "../../api";
import { ToolsPage } from "../Utils/ToolsPage";
import ConfirmDialog from "../Utils/ConfirmDialog";
import "../../styles/about.css";

// A single About doc: members read it as a clean page; contributors get an
// inline title + body editor and delete. /about/:section/new creates one.
export default function AboutDoc() {
  const { slug, section } = useParams<{ slug?: string; section?: string }>();
  const create = !slug;
  const navigate = useNavigate();
  const { token, currentRole } = useAuth()!;
  const isContributor = currentRole === "contributor";
  const [doc, setDoc] = useState<DocOut | null>(null);
  const [loading, setLoading] = useState(!create);
  const [editing, setEditing] = useState(create);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    if (create || !slug) return;
    let alive = true;
    get_doc(slug, token)
      .then((d) => { if (!alive) return; setDoc(d); setTitle(d.title); setBody(d.body); })
      .catch(() => { if (alive) alert("could not load this doc"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [create, slug, token]);

  const backTarget = `/about/${doc?.section ?? section ?? ""}`;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) { alert("give the doc a title."); return; }
    setSaving(true);
    try {
      if (create) { const d = await create_doc(section!, t, body, token); navigate(`/about/doc/${d.slug}`, { replace: true }); }
      else { const d = await update_doc(slug!, t, body, token); setDoc(d); setEditing(false); }
    } catch (err) { alert((err as Error).message || "could not save"); }
    finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    setShowDelete(false);
    try { await delete_doc(slug!, token); navigate(backTarget); }
    catch (err) { alert((err as Error).message || "could not delete"); }
  };

  return (
    <ToolsPage
      title={create ? "new doc" : editing ? "editing" : (doc?.section ?? "about")}
      contributorOnly={false}
      onBack={() => navigate(backTarget)}
      action={!editing && isContributor && doc && (
        <div className="tools-row-actions">
          <button className="tools-btn tools-btn-gold" onClick={() => setEditing(true)}>edit</button>
          <button className="tools-btn tools-btn-danger" onClick={() => setShowDelete(true)}>delete</button>
        </div>
      )}
    >
      {showDelete && (
        <ConfirmDialog message="delete this doc?" confirmLabel="yes, delete" cancelLabel="keep it" onConfirm={confirmDelete} onCancel={() => setShowDelete(false)} />
      )}
      {loading ? <p className="tools-empty">loading…</p> : editing ? (
        <form className="doc-editor" onSubmit={save}>
          <input className="doc-title-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="title" autoFocus />
          <textarea className="doc-body-input" rows={16} value={body} onChange={(e) => setBody(e.target.value)} placeholder="write the doc… (blank lines separate paragraphs)" />
          <div className="tools-row-actions" style={{ justifyContent: "flex-end" }}>
            {!create && <button type="button" className="tools-btn" onClick={() => { setEditing(false); if (doc) { setTitle(doc.title); setBody(doc.body); } }}>cancel</button>}
            <button type="submit" className="tools-btn tools-btn-gold" disabled={saving}>{saving ? "saving…" : create ? "create" : "save"}</button>
          </div>
        </form>
      ) : doc && (
        <article className="doc">
          <h2 className="doc-title">{doc.title}</h2>
          <div className="doc-body">{doc.body}</div>
        </article>
      )}
    </ToolsPage>
  );
}
