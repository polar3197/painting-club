import { useState, FormEvent } from "react";
import "../../styles/login.css";
import { login_user, get_profile, redeem_setup_code, forgot_password } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";
import ApplicationDialog from "../Utils/ApplicationDialog";

// Small overlay panel shared by the secret-code and forgot-password dialogs —
// the web twin of the iOS landing page's secretBackdrop/secretPanel modals.
// Backdrop click dismisses; clicks on the panel don't propagate.
const SecretPanel = ({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) => (
  <div className="secret-backdrop" onClick={onClose}>
    <div className="secret-panel" onClick={(e) => e.stopPropagation()}>
      <div className="secret-label">{label}</div>
      {children}
    </div>
  </div>
);

// The login unit, mirroring the iOS LandingPage: un/pw + login, then a split
// row of the two onboarding paths (request acc / secret code?), then the
// forgot-password link.
export default function Login(
  { bottom, left, background_color } : { bottom : number; left: number; background_color: string; }
) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showApplication, setShowApplication] = useState(false);
  const [showSecretCode, setShowSecretCode] = useState(false);
  const [setupCode, setSetupCode] = useState("");
  const [showForgot, setShowForgot] = useState(false);
  const [forgotUname, setForgotUname] = useState("");
  const { login } = useAuth()!;
  const navigate = useNavigate();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = username.trim().toLowerCase();
    const payload = { username: normalized, password };
    try {
      const response = await login_user(payload);
      if (response.must_setup) {
        // Don't call get_profile yet — temp users have a placeholder username; let them finish setup first.
        login(normalized, response.access_token, "member");
        navigate("/setup");
        return;
      }
      const profile = await get_profile(normalized, response.access_token);
      login(normalized, response.access_token, profile.role);
      navigate(`/members/${normalized}/profile`);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  // The admin-handed setup code: redeem it for a temp token, then finish on
  // /setup exactly like a must_setup login. The real username is chosen there.
  const handleSetupCode = async (e: FormEvent) => {
    e.preventDefault();
    const code = setupCode.trim();
    if (!code) return;
    try {
      const res = await redeem_setup_code(code);
      setShowSecretCode(false);
      login("", res.access_token, "member");
      navigate("/setup");
    } catch (err) {
      alert((err as Error).message || "Invalid or expired setup code");
    }
  };

  // Fire-and-forget, like iOS: the endpoint always answers ok; the admin
  // sends a fresh secret code manually.
  const handleForgotSubmit = (e: FormEvent) => {
    e.preventDefault();
    const uname = forgotUname.trim().toLowerCase();
    if (!uname) return;
    forgot_password(uname).catch(() => {});
    setShowForgot(false);
    setForgotUname("");
  };

  return (
    <>
    {showApplication && <ApplicationDialog onClose={() => setShowApplication(false)} />}

    {showSecretCode && (
      <SecretPanel label="secret code" onClose={() => setShowSecretCode(false)}>
        <form className="secret-code-row" onSubmit={handleSetupCode}>
          <input
            className="secret-code-input"
            placeholder="paste it"
            autoCapitalize="none"
            autoCorrect="off"
            autoFocus
            value={setupCode}
            onChange={(e) => setSetupCode(e.target.value)}
          />
          <button type="submit" className="secret-code-btn" aria-label="redeem code">→</button>
        </form>
      </SecretPanel>
    )}

    {showForgot && (
      <SecretPanel label="forgot password" onClose={() => { setShowForgot(false); setForgotUname(""); }}>
        <p className="forgot-body">type your username and we'll send you a new secret code asap</p>
        <form className="secret-code-row" onSubmit={handleForgotSubmit}>
          <input
            className="secret-code-input"
            placeholder="username"
            autoCapitalize="none"
            autoCorrect="off"
            autoFocus
            value={forgotUname}
            onChange={(e) => setForgotUname(e.target.value.toLowerCase())}
          />
          <button type="submit" className="secret-code-btn" aria-label="send request">✓</button>
        </form>
      </SecretPanel>
    )}

    <div className="login-container" style={{ bottom: `${bottom}rem`, left: `${left}rem`, backgroundColor: `${background_color}`}}>
      <div className="login-body">
        <form className="user-form" onSubmit={handleSubmit}>
          <div className="input-wrapper">
            <div className="input-title">un:</div>
            <input
              type="text"
              placeholder=""
              onChange={(event) => setUsername(event.target.value)}
              value={username}
            />
          </div>
          <div className="input-wrapper">
            <div className="input-title">pw:</div>
            <div className="password-field">
              <input
                type={showPassword ? "text" : "password"}
                placeholder=""
                onChange={(event) => setPassword(event.target.value)}
                value={password}
              />
              <button
                type="button"
                className="password-toggle"
                onMouseDown={(e) => {
                  if (window.matchMedia("(max-width: 640px)").matches) e.preventDefault();
                }}
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20C5 20 1 12 1 12a21.77 21.77 0 0 1 5.06-5.94" />
                    <path d="M9.88 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.77 21.77 0 0 1-3.17 4.19" />
                    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <button type="submit">login</button>
          {/* Split row: direct access to both onboarding paths, equally weighted. */}
          <div className="login-split-row">
            <button type="button" onClick={() => setShowApplication(true)}>request acc</button>
            <button type="button" onClick={() => setShowSecretCode(true)}>secret code?</button>
          </div>
          <button
            type="button"
            className="login-forgot-link"
            onClick={() => { setForgotUname(username.trim().toLowerCase()); setShowForgot(true); }}
          >
            forgot password?
          </button>
        </form>
      </div>
    </div>
    </>
  );
}
