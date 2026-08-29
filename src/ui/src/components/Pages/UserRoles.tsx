import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { AdminMemberOut, get_admin_members } from "../../api";
import { ToolsPage, RoleBadge } from "../Utils/ToolsPage";

// Role management (contributor-only): every member with their role; search,
// then click one to set the role.
export default function UserRoles() {
  const navigate = useNavigate();
  const { token } = useAuth()!;
  const [members, setMembers] = useState<AdminMemberOut[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setMembers(await get_admin_members(token)); }
    catch { /* keep what's on screen */ }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? members.filter((m) => `${m.firstname || ""} ${m.lastname || ""} ${m.username}`.toLowerCase().includes(q))
    : members;

  return (
    <ToolsPage title="user roles" onBack={() => navigate("/settings")}>
      <input
        className="tools-search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="search members"
        autoCapitalize="none"
      />
      {loading ? (
        <p className="tools-empty">loading…</p>
      ) : filtered.length === 0 ? (
        <p className="tools-empty">no members match.</p>
      ) : (
        filtered.map((m) => (
          <button key={m.username} className="tools-row" onClick={() => navigate(`/user-roles/${m.username}`)}>
            <div className="tools-row-main">
              <span className="tools-row-title">
                {m.firstname || m.lastname ? `${m.firstname || ""} ${m.lastname || ""}`.trim() : m.username}
              </span>
              <span className="tools-row-meta">@{m.username}</span>
            </div>
            <RoleBadge role={m.role} />
          </button>
        ))
      )}
    </ToolsPage>
  );
}
