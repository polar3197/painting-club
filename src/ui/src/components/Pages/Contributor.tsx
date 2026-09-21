import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { AnnouncementOut, get_announcements, delete_announcement, get_signup_invites, create_signup_invite, SignupInviteOut } from "../../api";
import { ToolsPage } from "../Utils/ToolsPage";
import ConfirmDialog from "../Utils/ConfirmDialog";
import AnnouncementComposeDialog from "../Utils/AnnouncementComposeDialog";
import KebabMenu from "../Utils/KebabMenu";

// Contributor-only hub (Settings → "contributor"): the two club QRs, plus
// authoring and moderating announcements.
export default function Contributor() {
  const navigate = useNavigate();
  const { token } = useAuth()!;
  const [items, setItems] = useState<AnnouncementOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AnnouncementOut | null>(null);

  // Two QRs, and they do very different things — see the labels below. The
  // club one is the one you hold up at a meeting; the trusted one hands out a
  // live account with nobody reviewing it, so it stays hidden until asked for.
  const [clubQr, setClubQr] = useState<string | null>(null);
  const [trustedQr, setTrustedQr] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);
  const [showTrusted, setShowTrusted] = useState(false);
  const [mintingTrusted, setMintingTrusted] = useState(false);

  const isLive = (i: SignupInviteOut) =>
    !i.revoked &&
    (i.expires_at === null || new Date(i.expires_at + "Z") > new Date()) &&
    (i.max_uses === null || i.uses < i.max_uses);

  const renderQr = useCallback(async (inviteToken: string) => {
    const { default: QRCode } = await import("qrcode");
    return QRCode.toDataURL(`${window.location.origin}/join?i=${inviteToken}`, { margin: 1, width: 480 });
  }, []);

  // The club QR is minted on first view if it doesn't exist. The trusted one
  // never is — it only appears when a contributor deliberately asks for it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const invites = await get_signup_invites(token);
        const club =
          invites.find((i) => isLive(i) && !i.instant) ??
          (await create_signup_invite({ label: "club qr" }, token));
        const data = await renderQr(club.token);
        if (!cancelled) setClubQr(data);
      } catch {
        if (!cancelled) setQrError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [token, renderQr]);

  const revealTrusted = async () => {
    setShowTrusted(true);
    if (trustedQr || mintingTrusted) return;
    setMintingTrusted(true);
    try {
      const invites = await get_signup_invites(token);
      const trusted =
        invites.find((i) => isLive(i) && i.instant) ??
        (await create_signup_invite({ label: "trusted qr", instant: true }, token));
      setTrustedQr(await renderQr(trusted.token));
    } catch {
      setQrError(true);
    } finally {
      setMintingTrusted(false);
    }
  };

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
        <h2 className="tools-section-title">club QR — scan to apply</h2>
        <p className="tools-note">
          the one to hold up at a meeting. they fill in an application and pick their own
          username and password; a member approves it and they're in — no code to send.
        </p>
        {clubQr
          ? <img className="tools-qr" src={clubQr} alt="scan to apply to painting club" />
          : <p className="tools-empty">{qrError ? "couldn't load the QR" : "loading…"}</p>}
      </section>

      <section className="tools-section">
        <h2 className="tools-section-title">trusted QR — instant account, no review</h2>
        <p className="tools-note tools-note-warn">
          skips the queue entirely: whoever scans this has an account before anyone sees it.
          only for someone standing in front of you. hidden by default so it can't be
          scanned off your screen by accident.
        </p>
        {showTrusted ? (
          trustedQr
            ? <img className="tools-qr tools-qr-trusted" src={trustedQr} alt="trusted QR — creates an account immediately" />
            : <p className="tools-empty">{qrError ? "couldn't load the QR" : "minting…"}</p>
        ) : (
          <button className="tools-btn tools-btn-gold" onClick={revealTrusted}>
            show the trusted QR
          </button>
        )}
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
