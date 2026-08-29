import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { get_conversations, get_member_directory, open_dm, create_group, ConversationOut, MemberDirectoryEntry } from "../../api";
import "../../styles/utils/dialog.css";
import "../../styles/messages.css";

type Mode = "1:1" | "groups";
const POLL_MS = 6000;

// Messages inbox: 1:1 and group threads behind a toggle, refreshed on a short
// interval while open (no push infrastructure yet). "+" opens the compose
// sheet — click a member to open a DM, or (groups) pick several + a name.
export default function Messages() {
  const navigate = useNavigate();
  const { currentUser, token } = useAuth()!;
  const [mode, setMode] = useState<Mode>("1:1");
  const [conversations, setConversations] = useState<ConversationOut[] | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [members, setMembers] = useState<MemberDirectoryEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupTitle, setGroupTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try { setConversations(await get_conversations(token)); }
    catch { setConversations((c) => c ?? []); }
  }, [token]);

  useEffect(() => {
    load();
    const iv = setInterval(load, POLL_MS);
    return () => clearInterval(iv);
  }, [load]);

  const openThread = (c: ConversationOut) =>
    navigate(`/messages/${c.id}`, { state: { title: c.title, type: c.type, partnerUsername: c.partner_username } });

  const openCompose = async () => {
    setSelected(new Set());
    setGroupTitle("");
    setShowCompose(true);
    // Server-side directory already excludes the caller and blocked pairs.
    try { setMembers(await get_member_directory(token)); } catch { setMembers([]); }
  };

  const startDm = async (username: string) => {
    if (creating) return;
    setCreating(true);
    try { const convo = await open_dm(username, token); setShowCompose(false); openThread(convo); }
    catch (err) { alert((err as Error).message || "could not open messages"); }
    finally { setCreating(false); }
  };

  const toggleSelected = (username: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(username)) next.delete(username); else next.add(username);
    return next;
  });

  const submitGroup = async () => {
    const title = groupTitle.trim();
    if (!title || selected.size === 0 || creating) return;
    setCreating(true);
    try { const convo = await create_group(title, Array.from(selected), token); setShowCompose(false); load(); openThread(convo); }
    catch (err) { alert((err as Error).message || "could not create group"); }
    finally { setCreating(false); }
  };

  const isGroupMode = mode === "groups";
  const convos = (conversations ?? []).filter((c) => (isGroupMode ? c.type === "group" : c.type === "dm"));
  const groupReady = groupTitle.trim().length > 0 && selected.size > 0 && !creating;

  return (
    <main className="page messages-page">
      {showCompose && (
        <div className="sheet-backdrop" onClick={() => setShowCompose(false)}>
          <div className="dialog sheet-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="exit"><button onClick={() => setShowCompose(false)}>x</button></div>
            <div className="sheet-head">
              <h2 className="sheet-title">{isGroupMode ? "new group" : "new message"}</h2>
              {isGroupMode && (
                <button className="msg-btn" disabled={!groupReady} onClick={submitGroup}>{creating ? "creating…" : "create"}</button>
              )}
            </div>
            {isGroupMode && (
              <input className="sheet-input" placeholder="group name" value={groupTitle} onChange={(e) => setGroupTitle(e.target.value)} autoFocus />
            )}
            <div className="sheet-list">
              {members.length === 0 ? <p className="msg-empty">no members to show</p> : members.map((m) => (
                <button
                  key={m.username}
                  className={`sheet-row ${isGroupMode && selected.has(m.username) ? "picked" : ""}`}
                  disabled={creating}
                  onClick={() => (isGroupMode ? toggleSelected(m.username) : startDm(m.username))}
                >
                  <span className="sheet-name">{[m.firstname, m.lastname].filter(Boolean).join(" ") || m.username}</span>
                  <span className="sheet-user">@{m.username}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="messages-inner">
        <div className="messages-header">
          <div className="messages-header-left">
            <button className="back-btn" onClick={() => navigate(currentUser ? `/members/${currentUser}/profile` : "/home")}>‹ back</button>
            <h1 className="messages-title">messages</h1>
          </div>
          <div className="messages-actions">
            <button className="msg-btn" onClick={openCompose}>+ new</button>
          </div>
        </div>

        <div className="msg-toggle">
          <div className={`msg-toggle-box ${isGroupMode ? "right" : ""}`} />
          <button className="msg-toggle-item" onClick={() => setMode("1:1")}>1:1</button>
          <button className="msg-toggle-item" onClick={() => setMode("groups")}>groups</button>
        </div>

        {conversations === null ? (
          <p className="msg-empty">loading…</p>
        ) : convos.length === 0 ? (
          <p className="msg-empty">{isGroupMode ? "no groups yet — hit + to start one" : "no messages yet — hit + to say hi"}</p>
        ) : (
          convos.map((c) => (
            <button key={c.id} className="convo-row" onClick={() => openThread(c)}>
              <span className="convo-main">
                <span className="convo-title">{c.title}</span>
                {c.last_message !== null && (
                  <span className="convo-preview">
                    {c.last_sender_username === currentUser ? "you" : c.last_sender_username}: {c.last_message}
                  </span>
                )}
              </span>
              {c.unread > 0 && <span className="convo-unread">{c.unread}</span>}
            </button>
          ))
        )}
      </div>
    </main>
  );
}
