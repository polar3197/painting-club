import { useCallback, useEffect, useLayoutEffect, useRef, useState, FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ConversationOut,
  MemberDirectoryEntry,
  MessageOut,
  ParticipantOut,
  add_group_members,
  create_group,
  get_conversations,
  get_member_directory,
  get_messages,
  get_participants,
  leave_group,
  open_dm,
  send_message,
} from "../../api";
import { useAuth } from "../../context/AuthContext";
import ConfirmDialog from "../Utils/ConfirmDialog";
import "../../styles/messages.css";

const LIST_POLL_MS = 6000;
const THREAD_POLL_MS = 4000;

// Server timestamps are naive UTC — append Z so Date doesn't read them as local.
function parseUtc(s: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
}

function formatTime(s: string): string {
  return parseUtc(s).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase();
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDayLabel(s: string): string {
  const d = parseUtc(s);
  const now = new Date();
  if (sameDay(d, now)) return "today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return "yesterday";
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === now.getFullYear()
      ? { weekday: "short", month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" };
  return d.toLocaleDateString([], opts).toLowerCase();
}

function displayName(m: MemberDirectoryEntry): string {
  const full = [m.firstname, m.lastname].filter(Boolean).join(" ");
  return full ? `${full} (@${m.username})` : `@${m.username}`;
}

// ---------------------------------------------------------------------------
// Compose sheet — pick a member for a DM, or several + a title for a group.
// ---------------------------------------------------------------------------

function ComposeSheet({
  token,
  onClose,
  onOpened,
}: {
  token: string | null;
  onClose: () => void;
  onOpened: (conv: ConversationOut) => void;
}) {
  const [directory, setDirectory] = useState<MemberDirectoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<"dm" | "group">("dm");
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    get_member_directory(token)
      .then(setDirectory)
      .catch(() => setDirectory([]))
      .finally(() => setLoaded(true));
  }, [token]);

  const pick = async (username: string) => {
    if (mode === "dm") {
      if (busy) return;
      setBusy(true);
      try {
        const conv = await open_dm(username, token);
        onOpened(conv);
      } catch (err) {
        alert((err as Error).message);
        setBusy(false);
      }
      return;
    }
    setSelected((prev) =>
      prev.includes(username) ? prev.filter((u) => u !== username) : [...prev, username],
    );
  };

  const handleCreateGroup = async () => {
    const name = title.trim();
    if (!name || selected.length === 0 || busy) return;
    setBusy(true);
    try {
      const conv = await create_group(name, selected, token);
      onOpened(conv);
    } catch (err) {
      alert((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="msg-overlay-backdrop" onClick={onClose}>
      <div className="msg-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="msg-sheet-tabs">
          <button className={mode === "dm" ? "active" : ""} onClick={() => setMode("dm")}>1:1</button>
          <button className={mode === "group" ? "active" : ""} onClick={() => setMode("group")}>group</button>
        </div>
        {mode === "group" && (
          <input
            className="msg-sheet-title-input"
            placeholder="group name"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        )}
        <div className="msg-sheet-list">
          {!loaded && <p className="msg-muted">loading...</p>}
          {loaded && directory.length === 0 && <p className="msg-muted">no members found</p>}
          {directory.map((m) => (
            <button
              key={m.username}
              className={`msg-sheet-row ${mode === "group" && selected.includes(m.username) ? "picked" : ""}`}
              onClick={() => pick(m.username)}
            >
              {displayName(m)}
              {mode === "group" && selected.includes(m.username) && <span className="msg-check">✓</span>}
            </button>
          ))}
        </div>
        {mode === "group" && (
          <button
            className="msg-sheet-submit"
            disabled={!title.trim() || selected.length === 0 || busy}
            onClick={handleCreateGroup}
          >
            {busy ? "creating..." : `create group (${selected.length})`}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invite sheet — directory minus current participants, multi-select.
// ---------------------------------------------------------------------------

function InviteSheet({
  conversationId,
  participants,
  token,
  onClose,
  onInvited,
}: {
  conversationId: string;
  participants: ParticipantOut[];
  token: string | null;
  onClose: () => void;
  onInvited: () => void;
}) {
  const [directory, setDirectory] = useState<MemberDirectoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const inGroup = new Set(participants.map((p) => p.username));
  const candidates = directory.filter((m) => !inGroup.has(m.username));

  useEffect(() => {
    get_member_directory(token)
      .then(setDirectory)
      .catch(() => setDirectory([]))
      .finally(() => setLoaded(true));
  }, [token]);

  const handleInvite = async () => {
    if (selected.length === 0 || busy) return;
    setBusy(true);
    try {
      await add_group_members(conversationId, selected, token);
      onInvited();
    } catch (err) {
      alert((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="msg-overlay-backdrop" onClick={onClose}>
      <div className="msg-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="msg-sheet-heading">invite to group</div>
        <div className="msg-sheet-list">
          {!loaded && <p className="msg-muted">loading...</p>}
          {loaded && candidates.length === 0 && <p className="msg-muted">everyone's already here</p>}
          {candidates.map((m) => (
            <button
              key={m.username}
              className={`msg-sheet-row ${selected.includes(m.username) ? "picked" : ""}`}
              onClick={() =>
                setSelected((prev) =>
                  prev.includes(m.username) ? prev.filter((u) => u !== m.username) : [...prev, m.username],
                )
              }
            >
              {displayName(m)}
              {selected.includes(m.username) && <span className="msg-check">✓</span>}
            </button>
          ))}
        </div>
        <button className="msg-sheet-submit" disabled={selected.length === 0 || busy} onClick={handleInvite}>
          {busy ? "inviting..." : `invite (${selected.length})`}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thread — the right pane. Keyed by conversation id so state resets on switch.
// ---------------------------------------------------------------------------

function Thread({
  conversation,
  token,
  currentUser,
  onRead,
  onLeft,
  onBack,
}: {
  conversation: ConversationOut;
  token: string | null;
  currentUser: string | null;
  onRead: () => void;
  onLeft: () => void;
  onBack: () => void;
}) {
  const navigate = useNavigate();
  // Newest-first, matching the API — reversed once at render time.
  const [messages, setMessages] = useState<MessageOut[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Unseen threshold — captured on the FIRST fetch only; polls must not move it
  // or new messages would instantly lose their gold highlight.
  const prevReadAt = useRef<string | null | undefined>(undefined);
  const [participants, setParticipants] = useState<ParticipantOut[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const scrollAdjust = useRef<number | null>(null);

  const loadParticipants = useCallback(() => {
    if (conversation.type !== "group") return;
    get_participants(conversation.id, token).then(setParticipants).catch(() => {});
  }, [conversation.id, conversation.type, token]);

  // First page + 4s polling; merge by id so pagination state survives.
  useEffect(() => {
    let alive = true;
    const fetchFirstPage = async () => {
      try {
        const page = await get_messages(conversation.id, token);
        if (!alive) return;
        if (prevReadAt.current === undefined) {
          prevReadAt.current = page.previous_read_at;
          setNextCursor(page.next_cursor);
          setMessages(page.messages);
          setLoaded(true);
          onRead();
          return;
        }
        setMessages((existing) => {
          const fetchedIds = new Set(page.messages.map((m) => m.id));
          return [...page.messages, ...existing.filter((m) => !fetchedIds.has(m.id))];
        });
      } catch {
        // transient poll failure — next tick retries
      }
    };
    fetchFirstPage();
    loadParticipants();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") fetchFirstPage();
    }, THREAD_POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [conversation.id, token, onRead, loadParticipants]);

  // Pin scroll to bottom on load + new messages (unless the reader scrolled up);
  // preserve position when older messages get prepended above.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (scrollAdjust.current != null) {
      el.scrollTop += el.scrollHeight - scrollAdjust.current;
      scrollAdjust.current = null;
      return;
    }
    if (stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 40 && nextCursor && !loadingOlder) loadOlder();
  };

  const loadOlder = async () => {
    if (!nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await get_messages(conversation.id, token, nextCursor);
      scrollAdjust.current = scrollRef.current?.scrollHeight ?? null;
      setMessages((existing) => {
        const ids = new Set(existing.map((m) => m.id));
        return [...existing, ...page.messages.filter((m) => !ids.has(m.id))];
      });
      setNextCursor(page.next_cursor);
    } catch {
      // scroll again to retry
    } finally {
      setLoadingOlder(false);
    }
  };

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft("");
    try {
      const sent = await send_message(conversation.id, body, token);
      stickToBottom.current = true;
      setMessages((existing) =>
        existing.some((m) => m.id === sent.id) ? existing : [sent, ...existing],
      );
      onRead();
    } catch (err) {
      setDraft(body); // failed send restores the text instead of losing it
      alert((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const handleLeave = async () => {
    setConfirmLeave(false);
    try {
      await leave_group(conversation.id, token);
      onLeft();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const isUnseen = (m: MessageOut): boolean => {
    if (m.sender_username === currentUser) return false;
    const threshold = prevReadAt.current;
    if (threshold === undefined) return false;
    if (threshold === null) return true; // never opened before → everything is new
    return parseUtc(m.created_at) > parseUtc(threshold);
  };

  const ordered = [...messages].reverse(); // oldest → newest for display
  const isGroup = conversation.type === "group";

  return (
    <div className="msg-thread">
      <div className="msg-thread-header">
        <button className="msg-back" onClick={onBack}>←</button>
        <div className="msg-thread-titles">
          <div className="msg-thread-title">{conversation.title}</div>
          {conversation.type === "dm" && conversation.partner_username && (
            <button
              className="msg-thread-subtitle"
              onClick={() => navigate(`/members/${conversation.partner_username}/profile`)}
            >
              @{conversation.partner_username}
            </button>
          )}
          {isGroup && participants.length > 0 && (
            <div className="msg-thread-subtitle-static">
              {participants.map((p) => p.firstname || `@${p.username}`).join(", ")}
            </div>
          )}
        </div>
        {isGroup && (
          <div className="msg-thread-actions">
            <button title="invite someone" onClick={() => setShowInvite(true)}>+invite</button>
            <button title="leave group" onClick={() => setConfirmLeave(true)}>leave</button>
          </div>
        )}
      </div>

      <div className="msg-scroll" ref={scrollRef} onScroll={handleScroll}>
        {loadingOlder && <div className="msg-day-label">loading older...</div>}
        {ordered.map((m, i) => {
          const prev = i > 0 ? ordered[i - 1] : null;
          const showDay = prev
            ? !sameDay(parseUtc(m.created_at), parseUtc(prev.created_at))
            : nextCursor === null && loaded; // full history loaded → label the very first day
          const mine = m.sender_username === currentUser;
          const showSender = isGroup && !mine && (!prev || prev.sender_username !== m.sender_username || showDay);
          return (
            <div key={m.id}>
              {showDay && <div className="msg-day-label">{formatDayLabel(m.created_at)}</div>}
              <div className={`msg-row ${mine ? "mine" : "theirs"}`}>
                {showSender && (
                  <button
                    className="msg-sender"
                    onClick={() => navigate(`/members/${m.sender_username}/profile`)}
                  >
                    {m.sender_firstname || `@${m.sender_username}`}
                  </button>
                )}
                <div className={`msg-bubble ${mine ? "mine" : "theirs"} ${isUnseen(m) ? "unseen" : ""}`}>
                  {m.body}
                </div>
                <div className="msg-time">{formatTime(m.created_at)}</div>
              </div>
            </div>
          );
        })}
        {loaded && messages.length === 0 && (
          <p className="msg-muted msg-empty-thread">no messages yet — say hi</p>
        )}
      </div>

      <form className="msg-input-bar" onSubmit={handleSend}>
        <input
          placeholder="type a message..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" disabled={!draft.trim() || sending}>send</button>
      </form>

      {showInvite && (
        <InviteSheet
          conversationId={conversation.id}
          participants={participants}
          token={token}
          onClose={() => setShowInvite(false)}
          onInvited={() => {
            setShowInvite(false);
            loadParticipants();
          }}
        />
      )}
      {confirmLeave && (
        <ConfirmDialog
          message={`leave "${conversation.title}"?`}
          confirmLabel="leave"
          cancelLabel="stay"
          onConfirm={handleLeave}
          onCancel={() => setConfirmLeave(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page — two panes: conversation list | open thread. On phones the panes swap.
// ---------------------------------------------------------------------------

export default function Messages() {
  const auth = useAuth();
  const token = localStorage.getItem("token");
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState<ConversationOut[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<"dm" | "group">("dm");
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("c"));
  const [showCompose, setShowCompose] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const list = await get_conversations(token);
      setConversations(list);
    } catch {
      // transient poll failure
    } finally {
      setLoaded(true);
    }
  }, [token]);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, LIST_POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // Deep link (?c=...) may point at a conversation of either type — follow it.
  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  useEffect(() => {
    if (selected && selected.type !== tab) setTab(selected.type);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const select = (conv: ConversationOut | null) => {
    setSelectedId(conv?.id ?? null);
    // Opening a thread bumps the read cursor server-side; clear the badge now
    // rather than waiting for the next poll.
    if (conv) {
      setConversations((prev) => prev.map((c) => (c.id === conv.id ? { ...c, unread: 0 } : c)));
      setSearchParams({ c: conv.id }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  const handleOpened = (conv: ConversationOut) => {
    setShowCompose(false);
    setConversations((prev) => (prev.some((c) => c.id === conv.id) ? prev : [conv, ...prev]));
    setTab(conv.type);
    select(conv);
    refresh();
  };

  const shown = conversations.filter((c) => c.type === tab);

  return (
    <div className={`messages-page ${selected ? "thread-open" : ""}`}>
      <div className="msg-list-pane">
        <div className="msg-list-header">
          <div className="msg-tabs">
            <button className={tab === "dm" ? "active" : ""} onClick={() => setTab("dm")}>1:1</button>
            <button className={tab === "group" ? "active" : ""} onClick={() => setTab("group")}>groups</button>
          </div>
          <button className="msg-compose-btn" title="new message" onClick={() => setShowCompose(true)}>+</button>
        </div>
        <div className="msg-list">
          {!loaded && <p className="msg-muted">loading...</p>}
          {loaded && shown.length === 0 && (
            <p className="msg-muted">{tab === "dm" ? "no messages yet" : "no group chats yet"}</p>
          )}
          {shown.map((c) => (
            <button
              key={c.id}
              className={`msg-conv-row ${c.id === selectedId ? "selected" : ""}`}
              onClick={() => select(c)}
            >
              <div className="msg-conv-text">
                <div className="msg-conv-title">{c.title}</div>
                <div className="msg-conv-preview">
                  {c.last_message
                    ? `${c.last_sender_username === auth?.currentUser ? "you: " : c.type === "group" && c.last_sender_username ? `${c.last_sender_username}: ` : ""}${c.last_message}`
                    : "no messages yet"}
                </div>
              </div>
              {c.unread > 0 && <span className="msg-unread-badge">{c.unread}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="msg-thread-pane">
        {selected ? (
          <Thread
            key={selected.id}
            conversation={selected}
            token={token}
            currentUser={auth?.currentUser ?? null}
            onRead={refresh}
            onLeft={() => {
              select(null);
              refresh();
            }}
            onBack={() => select(null)}
          />
        ) : (
          <div className="msg-thread-empty">
            <p className="msg-muted">pick a conversation, or start one with +</p>
          </div>
        )}
      </div>

      {showCompose && (
        <ComposeSheet token={token} onClose={() => setShowCompose(false)} onOpened={handleOpened} />
      )}
    </div>
  );
}
