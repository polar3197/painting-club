import { useState, FormEvent } from "react";
import "../../styles/login.css";
import { login_user, get_profile } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";
import ApplicationDialog from "../Utils/ApplicationDialog";

export default function Login(
  { bottom, left, background_color } : { bottom : number; left: number; background_color: string; }
) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [member, setMember] = useState(true);
  const [memberStatus, setMemberStatus] = useState("not a member?");
  const [showApplication, setShowApplication] = useState(false);
  const { login } = useAuth()!;
  const navigate = useNavigate();

  const handleClick = () => {
    if (member) {
      setMember(false);
      setMemberStatus("ur a member?");
    } else {
      setMember(true);
      setMemberStatus("not a member?");
    }
  };

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

  return (
    <>
    {showApplication && <ApplicationDialog onClose={() => setShowApplication(false)} />}
    <div className="login-container" style={{ bottom: `${bottom}rem`, left: `${left}rem`, backgroundColor: `${background_color}`}}>
      <div className="login-body">
        {member && (
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
          </form>
        )}
        {!member && (
          <div className="non-member">
            <button onClick={() => setShowApplication(true)}>request account</button>
          </div>
        )}
      </div>
      <div className="login-footer">
        <button onClick={handleClick}>{memberStatus}</button>
      </div>
    </div>
    </>
  );
}
