import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  EventOut, MemberDirectoryEntry, get_event, delete_event,
  add_event_hosts, remove_event_host, add_event_invites, remove_event_invite, get_member_directory,
} from "../../api";
import { formatEventWhen } from "../../utils/date";
import ConfirmDialog from "../Utils/ConfirmDialog";
import KebabMenu from "../Utils/KebabMenu";
import "../../styles/utils/dialog.css";
import "../../styles/events.css";

type AddMode = "invite" | "host";

// Full event view. Hosts get edit/delete plus guest management (invite
// members or add co-hosts); everyone else sees a read-only card.
export default function EventDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = useAuth()!;
  const [event, setEvent] = useState<EventOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDelete, setShowDelete] = useState(false);
  const [pickerMode, setPickerMode] = useState<AddMode | null>(null);
  const [directory, setDirectory] = useState<MemberDirectoryEntry[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setEvent(await get_event(id, token)); }
    catch (err) { alert((err as Error).message || "could not load event"); navigate("/home"); }
    finally { setLoading(false); }
  }, [id, token, navigate]);
  useEffect(() => { load(); }, [load]);

  const openPicker = async (mode: AddMode) => {
    setPickerMode(mode);
    setSearch("");
    if (directory.length === 0) {
      try { setDirectory(await get_member_directory(token)); } catch { setDirectory([]); }
    }
  };

  const run = async (fn: () => Promise<unknown>, failMsg: string) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); await load(); }
    catch (err) { alert((err as Error).message || failMsg); }
    finally { setBusy(false); }
  };

  const addMember = (username: string) => run(
    () => pickerMode === "host" ? add_event_hosts(id, [username], token) : add_event_invites(id, [username], token),
    "could not add",
  );

  const confirmDelete = async () => {
    setShowDelete(false);
    try { await delete_event(id, token); navigate("/home"); }
    catch (err) { alert((err as Error).message || "could not delete"); }
  };

  if (loading || !event) {
    return <main className="page events-page"><div className="events-inner"><p className="events-empty">loading…</p></div></main>;
  }

  const canEdit = event.can_edit;
  const already = new Set([...event.hosts, ...(event.invited || [])]);
  const q = search.trim().toLowerCase();
  const filtered = directory.filter((m) =>
    !already.has(m.username) && (!q || `${m.firstname || ""} ${m.lastname || ""} ${m.username}`.toLowerCase().includes(q)));

  return (
    <main className="page events-page">
      {showDelete && (
        <ConfirmDialog
          message="delete this event?"
          confirmLabel="yes, delete"
          cancelLabel="keep it"
          onConfirm={confirmDelete}
          onCancel={() => setShowDelete(false)}
        />
      )}
      {pickerMode && (
        <div className="picker-backdrop" onClick={() => setPickerMode(null)}>
          <div className="dialog picker-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="exit"><button onClick={() => setPickerMode(null)}>x</button></div>
            <h2 className="picker-title">{pickerMode === "host" ? "add a co-host" : "invite a member"}</h2>
            <input className="picker-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="search members" autoFocus />
            <div className="picker-list">
              {filtered.length === 0
                ? <p className="events-empty">no members to add</p>
                : filtered.map((m) => (
                  <button key={m.username} className="picker-row" disabled={busy} onClick={() => addMember(m.username)}>
                    <span className="picker-name">{m.firstname || m.lastname ? `${m.firstname || ""} ${m.lastname || ""}`.trim() : m.username}</span>
                    <span className="picker-user">@{m.username}</span>
                  </button>
                ))}
            </div>
            <button className="events-btn" onClick={() => setPickerMode(null)}>done</button>
          </div>
        </div>
      )}

      <button className="back-btn" onClick={() => navigate("/home")}>‹ back</button>
      <div className="events-inner">
        <div className="events-header">
          <h1 className="events-title">event</h1>
          <div className="events-actions">
            {canEdit && (
              <KebabMenu items={[
                { label: "edit event", onClick: () => navigate(`/events/${id}/edit`) },
                { label: "delete event", onClick: () => setShowDelete(true), destructive: true },
              ]} />
            )}
          </div>
        </div>

        {event.image_path
          ? <img className="event-cover" src={event.image_path} alt="" />
          : <div className="event-cover event-cover-blank" style={event.color ? { backgroundColor: event.color } : undefined} />}

        <h2 className="event-detail-title">{event.title}</h2>
        <p className="event-when">{formatEventWhen(event.event_date, event.event_time)}</p>
        <p className="event-meta">{event.is_public ? "public" : "invite-only"} · hosted by @{event.creator_username}</p>
        {event.description && <p className="event-description">{event.description}</p>}

        <p className="event-section-label">hosts</p>
        <div className="chip-wrap">
          {event.hosts.map((h) => (
            <span key={h} className="chip">
              @{h}
              {canEdit && h !== event.creator_username && (
                <button className="chip-x" aria-label={`remove ${h}`} onClick={() => run(() => remove_event_host(id, h, token), "could not remove")}>×</button>
              )}
            </span>
          ))}
          {canEdit && <button className="add-btn" onClick={() => openPicker("host")}>+ co-host</button>}
        </div>

        {canEdit && (
          <>
            <p className="event-section-label">invited</p>
            <div className="chip-wrap">
              {(event.invited || []).map((u) => (
                <span key={u} className="chip">
                  @{u}
                  <button className="chip-x" aria-label={`uninvite ${u}`} onClick={() => run(() => remove_event_invite(id, u, token), "could not remove")}>×</button>
                </span>
              ))}
              {(event.invited || []).length === 0 && <span className="events-empty">no one invited yet</span>}
              <button className="add-btn" onClick={() => openPicker("invite")}>+ invite</button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
