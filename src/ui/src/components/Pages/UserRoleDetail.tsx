import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Profile, MemberRole, get_profile, set_member_role, profilePicSrc } from "../../api";
import { ToolsPage } from "../Utils/ToolsPage";

const ROLES: MemberRole[] = ["member", "admin", "contributor"];

const ROLE_BLURB: Record<MemberRole, string> = {
  member: "standard access",
  admin: "admin tools",
  contributor: "admin + docs, announcements & role management",
};

// Set one member's role (contributor-only). PATCH /admin/members/{username}/role.
export default function UserRoleDetail() {
  const { username = "" } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { token } = useAuth()!;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<MemberRole>("member");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    get_profile(username, token)
      .then((p) => { if (!alive) return; setProfile(p); setRole((p.role as MemberRole) || "member"); })
      .catch((err) => { alert((err as Error).message || "could not load member"); navigate("/user-roles"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [username, token, navigate]);

  const dirty = !!profile && role !== (profile.role as MemberRole);

  const save = async () => {
    if (saving || !profile) return;
    if (!dirty) { navigate("/user-roles"); return; }
    setSaving(true);
    try {
      await set_member_role(username, role, token);
      navigate("/user-roles");
    } catch (err) {
      alert((err as Error).message || "could not set role");
    } finally {
      setSaving(false);
    }
  };

  const name = profile
    ? (profile.firstname || profile.lastname ? `${profile.firstname || ""} ${profile.lastname || ""}`.trim() : profile.username)
    : "";
  const pic = profile ? profilePicSrc(profile) : null;

  return (
    <ToolsPage title="role" onBack={() => navigate("/user-roles")}>
      {loading || !profile ? (
        <p className="tools-empty">loading…</p>
      ) : (
        <>
          <div className="tools-role-head">
            {pic ? <img className="tools-role-pic" src={pic} alt="" /> : <div className="tools-role-pic">{(name[0] || "?").toUpperCase()}</div>}
            <span className="tools-role-name">{name}</span>
            <span className="tools-row-meta">@{profile.username}</span>
          </div>
          <p className="tools-sub">role</p>
          <div className="tools-role-opts">
            {ROLES.map((r) => (
              <button key={r} className={`tools-role-opt ${role === r ? "on" : ""}`} onClick={() => setRole(r)}>
                <span className="tools-role-radio" />
                <span>
                  <div className="tools-role-opt-name">{r}</div>
                  <div className="tools-role-opt-blurb">{ROLE_BLURB[r]}</div>
                </span>
              </button>
            ))}
          </div>
          <button className="tools-save" onClick={save} disabled={!dirty || saving}>
            {saving ? "saving…" : dirty ? "save role" : "no change"}
          </button>
        </>
      )}
    </ToolsPage>
  );
}
