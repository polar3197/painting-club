import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  get_conversations, get_messages, send_message, edit_message, delete_message, leave_group,
  get_participants, add_group_members, get_member_directory, MessageOut, MemberDirectoryEntry,
} from "../../api";
import { parseUtc } from "../../utils/date";
import ConfirmDialog from "../Utils/ConfirmDialog";
import KebabMenu from "../Utils/KebabMenu";
import "../../styles/utils/dialog.css";
import "../../styles/messages.css";

const POLL_MS = 4000;

interface ThreadMeta { title: string; type: "dm" | "group"; partnerUsername?: string | null }

const formatTime = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase();
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// today / yesterday / "wed, jul 2" (this year) / "jul 2, 2025" (older)
function formatDayLabel(d: Date): string {
  const now = new Date();
  if (sameDay(d, now)) return "today";
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return "yesterday";
  const opts: Intl.DateTimeFormatOptions = d.getFullYear() === now.getFullYear()
    ? { weekday: "short", month: "short", day: "numeric" }
    : { month: "short", day: "numeric", year: "numeric" };
  return d.toLocaleDateString([], opts).toLowerCase();
}

// Composer owns its text so keystrokes re-render only this bar.
function MessageInputBar({ onSend }: { onSend: (body: string) => Promise<void> }) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const submit = async () => {
    const body = input.trim();
    if (!body || sending) return;
    setInput("");
    setSending(true);
    try { await onSend(body); }
    catch (err) { setInput(body); alert((err as Error).message || "could not send your message"); }
    finally { setSending(false); }
  };
  return (
    <form className="thread-input-bar" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <textarea
        className="thread-input"
        value={input}
        placeholder="message..."
        rows={1}
        onChange={(e) => setInput(e.target.value)}
        // Enter sends; shift+enter for a newline.
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
      />
      <button type="submit" className="thread-send" disabled={!input.trim() || sending} aria-label="send">↑</button>
    </form>
  );
}

// One conversation, newest at the bottom. The first page is re-fetched on a
// short interval while open so replies appear without a refresh; fetching
// it also advances the server-side read cursor.
export default function ConversationThread() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, token } = useAuth()!;
  // Title/type ride along from the inbox; a direct link fetches them.
  const [meta, setMeta] = useState<ThreadMeta | null>((location.state as ThreadMeta | null) ?? null);
  const [messages, setMessages] = useState<MessageOut[]>([]); // newest first
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  // Unseen threshold captured on the FIRST fetch only — later polls must not
  // move it or incoming bubbles would instantly lose their unseen colour.
  const [prevReadAt, setPrevReadAt] = useState<string | null>(null);
  const firstLoadDone = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [invitable, setInvitable] = useState<MemberDirectoryEntry[]>([]);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<MessageOut | null>(null);
  const [editText, setEditText] = useState("");
  const [pendingDelete, setPendingDelete] = useState<MessageOut | null>(null);

  useEffect(() => {
    if (meta) return;
    get_conversations(token)
      .then((cs) => { const c = cs.find((x) => x.id === id); if (c) setMeta({ title: c.title, type: c.type, partnerUsername: c.partner_username }); else navigate("/messages"); })
      .catch(() => navigate("/messages"));
  }, [meta, id, token, navigate]);

  const mergeNewest = useCallback((incoming: MessageOut[]) => {
    setMessages((prev) => {
      const known = new Set(prev.map((m) => m.id));
      const fresh = incoming.filter((m) => !known.has(m.id));
      return fresh.length ? [...fresh, ...prev] : prev;
    });
  }, []);

  const loadFirstPage = useCallback(async () => {
    try {
      const page = await get_messages(id, token);
      if (!firstLoadDone.current) {
        firstLoadDone.current = true;
        setPrevReadAt(page.previous_read_at);
        setMessages(page.messages);
        setNextCursor(page.next_cursor);
      } else {
        mergeNewest(page.messages);
      }
    } catch { /* polling retries shortly */ }
  }, [id, token, mergeNewest]);

  useEffect(() => {
    firstLoadDone.current = false;
    loadFirstPage();
    const iv = setInterval(loadFirstPage, POLL_MS);
    return () => clearInterval(iv);
  }, [loadFirstPage]);

  // Keep the view pinned to the newest message unless the reader scrolled up.
  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  const loadOlder = async () => {
    if (!nextCursor) return;
    const el = listRef.current;
    const before = el ? el.scrollHeight - el.scrollTop : 0;
    try {
      const page = await get_messages(id, token, nextCursor);
      setMessages((prev) => { const known = new Set(prev.map((m) => m.id)); return [...prev, ...page.messages.filter((m) => !known.has(m.id))]; });
      setNextCursor(page.next_cursor);
      stickToBottom.current = false;
      // Keep the same messages in view after older ones are prepended.
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - before; });
    } catch { /* try again */ }
  };

  const sendBody = useCallback(async (body: string) => {
    const sent = await send_message(id, body, token);
    stickToBottom.current = true;
    mergeNewest([sent]);
  }, [id, token, mergeNewest]);

  const doLeave = async () => {
    setConfirmLeave(false);
    try { await leave_group(id, token); navigate("/messages"); }
    catch (err) { alert((err as Error).message || "could not leave"); }
  };

  const openInvite = async () => {
    setInvited(new Set());
    setShowInvite(true);
    try {
      const [directory, participants] = await Promise.all([get_member_directory(token), get_participants(id, token)]);
      const already = new Set(participants.map((p) => p.username));
      setInvitable(directory.filter((m) => !already.has(m.username)));
    } catch { setInvitable([]); }
  };

  const submitInvite = async () => {
    if (invited.size === 0 || inviting) return;
    setInviting(true);
    try { await add_group_members(id, Array.from(invited), token); setShowInvite(false); }
    catch (err) { alert((err as Error).message || "could not add members"); }
    finally { setInviting(false); }
  };

  const doDeleteMessage = async (m: MessageOut) => {
    setPendingDelete(null);
    // Optimistic remove; restore if the server rejects.
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    try { await delete_message(id, m.id, token); }
    catch (err) {
      setMessages((prev) => [m, ...prev].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)));
      alert((err as Error).message || "could not delete");
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    const body = editText.trim();
    if (!body || body === editing.body) { setEditing(null); return; }
    try {
      const updated = await edit_message(id, editing.id, body, token);
      setMessages((prev) => prev.map((x) => (x.id === updated.id ? { ...x, body: updated.body, edited_at: updated.edited_at } : x)));
      setEditing(null);
    } catch (err) { alert((err as Error).message || "could not edit"); }
  };

  const isGroup = meta?.type === "group";
  // Render oldest → newest; data is newest-first.
  const ordered = [...messages].reverse();

  return (
    <main className="page messages-page">
      {confirmLeave && (
        <ConfirmDialog message={`leave “${meta?.title ?? "this group"}”?`} confirmLabel="leave" cancelLabel="stay" onConfirm={doLeave} onCancel={() => setConfirmLeave(false)} />
      )}
      {pendingDelete && (
        <ConfirmDialog message="delete this message?" confirmLabel="delete" cancelLabel="keep it" onConfirm={() => doDeleteMessage(pendingDelete)} onCancel={() => setPendingDelete(null)} />
      )}
      {showInvite && (
        <div className="sheet-backdrop" onClick={() => setShowInvite(false)}>
          <div className="dialog sheet-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="exit"><button onClick={() => setShowInvite(false)}>x</button></div>
            <div className="sheet-head">
              <h2 className="sheet-title">add to “{meta?.title}”</h2>
              <button className="msg-btn" disabled={invited.size === 0 || inviting} onClick={submitInvite}>{inviting ? "adding…" : "add"}</button>
            </div>
            <div className="sheet-list">
              {invitable.length === 0 ? <p className="msg-empty">everyone's already here</p> : invitable.map((m) => (
                <button key={m.username} className={`sheet-row ${invited.has(m.username) ? "picked" : ""}`}
                  onClick={() => setInvited((prev) => { const n = new Set(prev); if (n.has(m.username)) n.delete(m.username); else n.add(m.username); return n; })}>
                  <span className="sheet-name">{[m.firstname, m.lastname].filter(Boolean).join(" ") || m.username}</span>
                  <span className="sheet-user">@{m.username}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {editing && (
        <div className="sheet-backdrop" onClick={() => setEditing(null)}>
          <div className="dialog sheet-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="exit"><button onClick={() => setEditing(null)}>x</button></div>
            <h2 className="sheet-title">edit message</h2>
            <textarea className="edit-input" rows={4} value={editText} onChange={(e) => setEditText(e.target.value)} autoFocus />
            <div className="messages-actions" style={{ justifyContent: "flex-end" }}>
              <button className="msg-btn msg-btn-plain" onClick={() => setEditing(null)}>cancel</button>
              <button className="msg-btn msg-btn-gold" disabled={!editText.trim()} onClick={saveEdit}>save</button>
            </div>
          </div>
        </div>
      )}

      <button className="back-btn" onClick={() => navigate("/messages")}>‹ back</button>
      <div className="messages-inner">
        <div className="messages-header">
          <div style={{ minWidth: 0 }}>
            <h1 className="messages-title">{meta?.title ?? "…"}</h1>
            {meta?.type === "dm" && meta.partnerUsername && (
              <p className="messages-subtitle">
                <button className="msg-sender" onClick={() => navigate(`/members/${meta.partnerUsername}/profile`)}>@{meta.partnerUsername}</button>
              </p>
            )}
          </div>
          <div className="messages-actions">
            {isGroup && <button className="add-btn" onClick={openInvite}>+ add</button>}
            {isGroup && <button className="msg-btn msg-btn-danger" onClick={() => setConfirmLeave(true)}>leave</button>}
          </div>
        </div>

        <div className="thread-list" ref={listRef} onScroll={onScroll}>
          {nextCursor && <button className="msg-btn msg-btn-plain thread-older" onClick={loadOlder}>load older</button>}
          {ordered.map((m, i) => {
            const isOwn = m.sender_username === currentUser;
            const unseen = !isOwn && (!prevReadAt || m.created_at > prevReadAt);
            const when = parseUtc(m.created_at);
            const older = ordered[i - 1];
            const showDay = older ? !sameDay(when, parseUtc(older.created_at)) : nextCursor === null;
            return (
              <div key={m.id} style={{ display: "contents" }}>
                {showDay && <span className="day-separator">{formatDayLabel(when)}</span>}
                <div className={`msg-row ${isOwn ? "own" : "other"}`}>
                  {!isOwn && isGroup && (
                    <button className="msg-sender" onClick={() => navigate(`/members/${m.sender_username}/profile`)}>
                      {m.sender_firstname || m.sender_username}{m.sender_firstname ? ` · @${m.sender_username}` : ""}
                    </button>
                  )}
                  <p className={`msg-bubble ${unseen ? "unseen" : ""}`}>{m.body}</p>
                  <span className="msg-time">
                    {formatTime(when)}{m.edited_at ? " · edited" : ""}
                    {isOwn && (
                      <span className="msg-action">
                        <KebabMenu small items={[
                          { label: "edit", onClick: () => { setEditText(m.body); setEditing(m); } },
                          { label: "delete", onClick: () => setPendingDelete(m), destructive: true },
                        ]} />
                      </span>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
          {messages.length === 0 && firstLoadDone.current && <p className="msg-empty">say hi.</p>}
        </div>

        <MessageInputBar onSend={sendBody} />
      </div>
    </main>
  );
}
