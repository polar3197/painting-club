import { FormEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { setup_account, get_profile } from "../../api";
import { useAuth } from "../../context/AuthContext";
import "../../styles/login.css";
import "../../styles/app-layout.css";

// Mirror the landing-page backdrop themes so the setup flow feels continuous.
const Themes = [
  { image: "imgs/ma.png",          card_left: 4,  card_bottom: 3,  title_left: 52, title_bottom: 29, card_bg: "transparent" },
  { image: "imgs/hopper-barn.png", card_left: 18, card_bottom: 13, title_left: 44, title_bottom: 31, card_bg: "rgb(216, 64, 25)" },
  { image: "imgs/diebenkorn.png",  card_left: 62, card_bottom: 3,  title_left: 55, title_bottom: 32, card_bg: "rgb(238, 114, 72)" },
  { image: "imgs/klimpt.png",      card_left: 38, card_bottom: 22, title_left: 3,  title_bottom: 13, card_bg: "lightgreen" },
];

export default function SetupAccount() {
  const { login, logout } = useAuth()!;
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const theme = useMemo(() => Themes[Math.floor(Math.random() * Themes.length)], []);
  const token = localStorage.getItem("token");

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const trimmed = username.trim().toLowerCase();
    if (trimmed.length < 1) {
      setError("username cannot be empty");
      return;
    }
    if (password.length < 8) {
      setError("password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("passwords don't match");
      return;
    }

    setSubmitting(true);
    try {
      const result = await setup_account({ new_username: trimmed, new_password: password }, token);
      const profile = await get_profile(result.username, token);
      login(result.username, token!, profile.role);
      navigate(`/members/${result.username}/profile`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page">
      <img src={theme.image} className="page-background" style={{ border: "1px black solid" }} />
      <div className="title" style={{ bottom: `${theme.title_bottom}rem`, left: `${theme.title_left}rem` }}>-• Painting Club •-</div>

      <div
        className="login-container login-container--setup"
        style={{ bottom: `${theme.card_bottom}rem`, left: `${theme.card_left}rem`, backgroundColor: theme.card_bg }}
      >
        <div className="login-body">
          <h2 className="login-setup-heading">welcome — pick a username + password</h2>
          <form className="user-form" onSubmit={handleSubmit}>
            <div className="input-wrapper">
              <div className="input-title">un:</div>
              <input
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="input-wrapper">
              <div className="input-title">pw:</div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="input-wrapper">
              <div className="input-title">pw2:</div>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {error && <div className="error">{error}</div>}
            <button type="submit" disabled={submitting}>
              {submitting ? "saving..." : "finish"}
            </button>
          </form>
          <button
            type="button"
            className="login-setup-cancel"
            onClick={() => { logout(); navigate("/landing-page"); }}
          >
            cancel + sign out
          </button>
        </div>
      </div>
    </main>
  );
}
