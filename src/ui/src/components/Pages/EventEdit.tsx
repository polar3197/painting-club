import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { create_event, get_event, update_event, upload_event_image } from "../../api";
import { todayLocalISO } from "../../utils/date";
import "../../styles/events.css";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

// Create (/events/new) or edit (/events/:id/edit) an event's core fields.
// Guest and co-host management lives on the detail page since those
// endpoints need an existing event.
export default function EventEdit() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { token } = useAuth()!;
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(searchParams.get("date") || todayLocalISO());
  const [time, setTime] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [color, setColor] = useState<string | null>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEdit) return;
    let alive = true;
    get_event(id!, token)
      .then((e) => {
        if (!alive) return;
        setTitle(e.title);
        setDescription(e.description || "");
        setDate(e.event_date);
        setTime(e.event_time ? e.event_time.slice(0, 5) : "");
        setIsPublic(e.is_public);
        setColor(e.color);
        setPreviewUrl(e.image_path);
      })
      .catch((err) => { alert((err as Error).message || "could not load event"); navigate("/home"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [isEdit, id, token, navigate]);

  // Local preview for a freshly picked file; revoked when replaced/unmounted.
  useEffect(() => {
    if (!picked) return;
    const url = URL.createObjectURL(picked);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [picked]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) { alert("give the event a name."); return; }
    if (!DATE_RE.test(date)) { alert("check the date."); return; }
    if (time.trim() && !TIME_RE.test(time.trim())) { alert("check the time (HH:MM), or leave it blank."); return; }
    setSaving(true);
    try {
      const body = { title: t, description: description.trim() || null, event_date: date, event_time: time.trim() || null, is_public: isPublic, color };
      let eventId = id;
      if (isEdit) await update_event(id!, body, token);
      else eventId = (await create_event(body, token)).id;
      if (picked && eventId) await upload_event_image(eventId, picked, token);
      // Home (where the calendar lives) after a create; back to the event
      // after an edit.
      navigate(isEdit ? `/events/${id}` : "/home");
    } catch (err) {
      alert((err as Error).message || "could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="page events-page">
      <div className="events-inner">
        <div className="events-header">
          <h1 className="events-title">{isEdit ? "edit event" : "new event"}</h1>
          <div className="events-actions">
            <button className="events-btn events-btn-plain" onClick={() => navigate(isEdit ? `/events/${id}` : "/home")}>cancel</button>
          </div>
        </div>
        {loading ? <p className="events-empty">loading…</p> : (
          <form className="event-form" onSubmit={save}>
            <label htmlFor="ev-title">title</label>
            <input id="ev-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="what's happening" autoFocus={!isEdit} />

            <label htmlFor="ev-desc">description</label>
            <textarea id="ev-desc" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="details, where, what to bring…" />

            <div className="event-form-row">
              <div>
                <label htmlFor="ev-date">date</label>
                <input id="ev-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>
              <div>
                <label htmlFor="ev-time">time (optional)</label>
                <input id="ev-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            </div>

            <div className="event-toggle-row">
              <div>
                <label>public</label>
                <div className="event-hint">{isPublic ? "anyone in the club can see it" : "only hosts + invited members"}</div>
              </div>
              <button type="button" role="switch" aria-checked={isPublic} className={`event-switch ${isPublic ? "on" : ""}`} onClick={() => setIsPublic((v) => !v)} />
            </div>

            <label htmlFor="ev-color">accent color (optional)</label>
            <div className="event-color-row">
              <input id="ev-color" type="color" value={color || "#e30022"} onChange={(e) => setColor(e.target.value)} />
              <span className="event-hint">{color ?? "none — uses the default red"}</span>
              {color && <button type="button" className="events-btn events-btn-plain" onClick={() => setColor(null)}>clear</button>}
            </div>

            <label>cover image</label>
            <div className="event-cover-pick" onClick={() => fileRef.current?.click()} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") fileRef.current?.click(); }}>
              {previewUrl ? <img src={previewUrl} alt="" /> : <span>click to add a cover</span>}
            </div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/heic,image/heif,.heic,.heif" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setPicked(f); }} />

            <button type="submit" className="event-save" disabled={saving}>
              {saving ? "saving…" : isEdit ? "save" : "create event"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
