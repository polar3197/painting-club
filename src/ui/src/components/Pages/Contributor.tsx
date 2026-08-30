import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import QRCode from "qrcode";
import { AnnouncementOut, get_announcements, delete_announcement, get_signup_invites, create_signup_invite } from "../../api";
import { ToolsPage } from "../Utils/ToolsPage";
import ConfirmDialog from "../Utils/ConfirmDialog";
import AnnouncementComposeDialog from "../Utils/AnnouncementComposeDialog";
import KebabMenu from "../Utils/KebabMenu";

// Contributor-only hub (Settings → "contributor"): author and moderate
// announcements. Click a row for its discussion; delete from the row.
export default function Contributor() {
  const navigate = useNavigate();
  const { token } = useAuth()!;
  const [items, setItems] = useState<AnnouncementOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AnnouncementOut | null>(null);

  // The club's standing signup QR: reuse the newest live invite token, mint
  // one the first time. Scanning lands on /join?i=<token> — instant account.
  const [qr, setQr] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const invites = await get_signup_invites(token);
        const live = invites.find((i) =>
          !i.revoked &&
          (i.expires_at === null || new Date(i.expires_at + "Z") > new Date()) &&
          (i.max_uses === null || i.uses < i.max_uses)
        ) ?? await create_signup_invite({ label: "club qr" }, token);
        const url = `${window.location.origin}/join?i=${live.token}`;
        const data = await QRCode.toDataURL(url, { margin: 1, width: 480 });
        if (!cancelled) setQr(data);
      } catch {
        if (!cancelled) setQrError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const load = useCallback(async () => {
    try { setItems(await get_announcements(token)); }
    catch { /* keep what's on screen */ }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const confirmDelete = async () => {
    const target = pendingDelete;
    if (!target) return;
    setPendingDelete(null);
    setItems((prev) => prev.filter((a) => a.id !== target.id));
    try { await delete_announcement(target.id, token); }
    catch { load(); }
  };

  return (
    <ToolsPage
      title="contributor" onBack={() => navigate("/settings")}
      action={<button className="add-btn" onClick={() => setComposing(true)}>+ announcement</button>}
    >
      {pendingDelete && (
        <ConfirmDialog
          message="delete this announcement?"
          confirmLabel="yes, delete"
          cancelLabel="keep it"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
      {composing && (
        <AnnouncementComposeDialog onClose={() => setComposing(false)} onPosted={load} />
      )}

      <section className="tools-section">
        <h2 className="tools-section-title">club QR — scan to join</h2>
        {qr
          ? <img className="tools-qr" src={qr} alt="scan to join painting club" />
          : <p className="tools-empty">{qrError ? "couldn't load the QR" : "loading…"}</p>}
      </section>

      <section className="tools-section">
      <h2 className="tools-section-title">announcements</h2>
      <p className="tools-note">click a row for its discussion; ⋯ to delete</p>
      {loading ? (
        <p className="tools-empty">loading…</p>
      ) : items.length === 0 ? (
        <p className="tools-empty">no announcements yet. post one with +.</p>
      ) : (
        items.map((a) => (
          <div key={a.id} className="tools-row" role="button" tabIndex={0}
            onClick={() => navigate(`/announcements/${a.id}`)}
            onKeyDown={(e) => { if (e.key === "Enter") navigate(`/announcements/${a.id}`); }}
          >
            <div className="tools-row-main">
              <span className="tools-row-title">{a.title}</span>
              <span className="tools-row-body">{a.body}</span>
              <span className="tools-row-meta">
                {a.comment_count > 0 ? `${a.comment_count} ${a.comment_count === 1 ? "reply" : "replies"}` : "no replies yet"}
              </span>
            </div>
            <KebabMenu items={[{ label: "delete", onClick: () => setPendingDelete(a), destructive: true }]} />
          </div>
        ))
      )}
      </section>
    </ToolsPage>
  );
}
