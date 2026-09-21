import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { redeem_signup_invite, setup_account, get_join_invite } from "../../api";
import ApplicationFlow from "../Utils/ApplicationFlow";
import "../../styles/join.css";

// QR landing (/join). There are two QRs and they mean different things, so the
// page asks the server which one was scanned before it renders anything:
//
// - the standing CLUB QR (kind "apply", the default): the application form.
//   A member reviews it; the applicant picks their own username and password
//   on the form, so approval makes the account live with nothing to relay.
// - the TRUSTED QR (kind "instant"): an account on the spot, no review.
//
// The kind is never inferred from the URL — /join/redeem refuses any token
// that isn't marked instant server-side, so a club token pasted into the
// instant path gets nowhere.
const APP_STORE_URL = "https://apps.apple.com/app/id6762710261";

// iPadOS 13+ reports itself as a Mac; the touch-points check catches it.
const isIOS = () =>
  /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

const AppStoreLink = ({ extraClass = "" }: { extraClass?: string }) => (
  <a className={`join-appstore ${extraClass}`} href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
    Get the app on the App Store
  </a>
);

// The trusted QR: redeem + setup behind one submit, no review.
const InviteSignup = ({ inviteToken, onDead }: { inviteToken: string; onDead: (msg: string) => void }) => {
  const navigate = useNavigate();
  const { login } = useAuth()!;
  const [form, setForm] = useState({ firstname: "", lastname: "", email: "", username: "", password: "", confirm: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null); // username once created

  const update = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const { firstname, lastname, email, username, password, confirm } = form;
    if (!firstname.trim() || !lastname.trim() || !email.trim()) { setError("Name and email are required."); return; }
    if (username.trim().length < 1) { setError("Pick a username."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setError(null);
    setSubmitting(true);
    try {
      const redeemed = await redeem_signup_invite({ token: inviteToken, firstname: firstname.trim(), lastname: lastname.trim(), email: email.trim() });
      const result = await setup_account({ new_username: username.trim().toLowerCase(), new_password: password }, redeemed.access_token);
      login(result.username, redeemed.access_token, "member");
      setDone(result.username);
    } catch (err) {
      const msg = (err as Error).message || "something went wrong";
      // A dead (or non-instant) token drops the visitor to the application.
      if (/no longer valid/i.test(msg)) onDead(msg);
      else setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="application-submitted">
        <p>you're in, @{done}.</p>
        <p className="application-submitted-sub">The club lives in the app — grab it and log in with the username and password you just made. Or keep going right here.</p>
        <div className="join-success-actions">
          <AppStoreLink extraClass="primary" />
          <button className="join-login-link" onClick={() => navigate(`/members/${done}/profile`)}>
            continue in the browser →
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="application-body" onSubmit={submit} noValidate>
      <h2 className="application-title">create your account</h2>
      <div className="application-row">
        <input placeholder="first name *" autoComplete="given-name" value={form.firstname} onChange={(e) => update({ firstname: e.target.value })} />
        <input placeholder="last name *" autoComplete="family-name" value={form.lastname} onChange={(e) => update({ lastname: e.target.value })} />
      </div>
      <input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" placeholder="email *" value={form.email} onChange={(e) => update({ email: e.target.value })} />
      <input placeholder="username *" autoComplete="username" autoCapitalize="none" value={form.username} onChange={(e) => update({ username: e.target.value })} />
      <input type="password" autoComplete="new-password" placeholder="password (8+ characters) *" value={form.password} onChange={(e) => update({ password: e.target.value })} />
      <input type="password" autoComplete="new-password" placeholder="confirm password *" value={form.confirm} onChange={(e) => update({ confirm: e.target.value })} />
      {error && <p className="application-error">{error}</p>}
      <button type="submit" className="application-submit" disabled={submitting}>
        {submitting ? "creating…" : "create account"}
      </button>
    </form>
  );
};

export default function Join() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("i");
  const [inviteDead, setInviteDead] = useState<string | null>(null);
  // null until the server says which QR this is. Rendering before it answers
  // would flash the wrong form.
  const [kind, setKind] = useState<"apply" | "instant" | null>(inviteToken ? null : "apply");
  const ios = isIOS();

  useEffect(() => {
    const prev = document.title;
    document.title = "join painting club";
    return () => { document.title = prev; };
  }, []);

  useEffect(() => {
    if (!inviteToken) return;
    let cancelled = false;
    get_join_invite(inviteToken)
      // An unknown or dead token still gets the application — being turned
      // away at the door because a flyer went stale is the worst outcome here.
      .then((r) => { if (!cancelled) setKind(r.valid ? r.kind : "apply"); })
      .catch(() => { if (!cancelled) setKind("apply"); });
    return () => { cancelled = true; };
  }, [inviteToken]);

  if (kind === null) {
    return (
      <main className="join-wrapper">
        <div className="join-card">
          <div className="join-header">
            <div className="join-title">-• Painting Club •-</div>
            <p className="join-tagline">one moment…</p>
          </div>
        </div>
      </main>
    );
  }

  // The application takes the whole screen — it is the first impression, and
  // it has nothing to share the surface with.
  if (kind === "apply" || inviteDead) {
    return <ApplicationFlow inviteToken={inviteToken} />;
  }

  return (
    <main className="join-wrapper">
      <div className="join-card">
        <div className="join-header">
          <div className="join-title">-• Painting Club •-</div>
          <p className="join-tagline">You found us. Make an account and you're in.</p>
          {inviteDead && <p className="join-invite-dead">{inviteDead}</p>}
        </div>
        <InviteSignup inviteToken={inviteToken as string} onDead={setInviteDead} />
        {ios && (
          <div className="join-footer">
            <AppStoreLink />
            <button className="join-login-link" onClick={() => navigate("/landing-page")}>
              already a member? log in
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
