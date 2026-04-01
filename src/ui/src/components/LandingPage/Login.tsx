import { useState, FormEvent } from "react";
import "../../styles/login.css";
import { login_user } from "../../api";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";

export default function Login(
  { bottom, left, background_color } : { bottom : number; left: number; background_color: string; }
) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [member, setMember] = useState(true);
  const [memberStatus, setMemberStatus] = useState("not a member?");
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
    const payload = { username, password };
    try {
      const response = await login_user(payload);
      login(username, response.access_token);
      navigate(`/members/${username}/profile`);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  return (
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
              <input
                type="password"
                placeholder=""
                onChange={(event) => setPassword(event.target.value)}
                value={password}
              />
            </div>
            <button type="submit">login</button>
          </form>
        )}
        {!member && (
          <div className="non-member">
            <button>view artists profiles</button>
            <button>request account</button>
          </div>
        )}
      </div>
      <div className="login-footer">
        <button onClick={handleClick}>{memberStatus}</button>
      </div>
    </div>
  );
}
