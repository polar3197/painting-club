import { useCallback, useEffect, useRef, useState } from "react";
import { submit_application, upload_application_art, check_username_available } from "../../api";
import { downscaleImage, newDraftId } from "../../utils/downscaleImage";
import "../../styles/application-flow.css";

// The application form. Two pages, full-screen on a phone.
//
//   1. name · city · a piece of art        -> next
//   2. username · password · email         -> submit
//
// Three things carry the feel, and all three are structural rather than
// cosmetic:
//
// - The photo appears the instant it's picked, rendered from the local file.
//   No network is involved in showing it, ever.
// - The bytes are *prepared* on pick (downscale, off the main thread) but only
//   *sent* on "next". Preparing early keeps the page transition instant;
//   sending late means nothing is ever in flight while they're still choosing,
//   which is what removes the re-pick race almost entirely.
// - The upload is an optimisation the submit path never depends on. If it
//   didn't land, submit sends the bytes itself — a dead zone costs two seconds
//   at the end, not a lost application.

const MIN_PASSWORD = 8;

interface PreparedArt {
  blob: Blob;
  aspectRatio: number | null;
}

export default function ApplicationFlow({
  inviteToken,
  onSubmitted,
  onClose,
}: {
  inviteToken?: string | null;
  onSubmitted?: () => void;
  onClose?: () => void;
}) {
  const [page, setPage] = useState<0 | 1>(0);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [firstname, setFirstname] = useState("");
  const [lastname, setLastname] = useState("");
  const [city, setCity] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");

  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Refs, not state, wherever a value is read back inside an async flow —
  // submit has to see what's true *now*, not what was captured when it
  // rendered.
  const draftIdRef = useRef<string>(newDraftId());
  const pickSeqRef = useRef(0);
  const artRef = useRef<PreparedArt | null>(null);
  const uploadDoneRef = useRef(false);
  const inflightRef = useRef<{
    seq: number;
    controller: AbortController;
    promise: Promise<unknown>;
  } | null>(null);
  const previewRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const [unameState, setUnameState] = useState<"idle" | "checking" | "free" | "taken">("idle");

  // --- keyboard / viewport --------------------------------------------------
  // iOS Safari does NOT shrink the layout viewport when the keyboard opens; it
  // scrolls the page under it, which is exactly the "scrolls out of view" jank.
  // Sizing the panel to visualViewport instead means the panel simply gets
  // shorter and the button it contains never moves off screen.
  useEffect(() => {
    const vv = window.visualViewport;
    const el = rootRef.current;
    if (!vv || !el) return;
    const apply = () => {
      el.style.setProperty("--flow-h", `${vv.height}px`);
      el.style.setProperty("--flow-top", `${vv.offsetTop}px`);
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
    };
  }, []);

  // Lock the document behind the panel so there is no page scroll to fight.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      inflightRef.current?.controller.abort();
    },
    [],
  );

  // --- picking --------------------------------------------------------------
  const onPick = useCallback(async (file: File) => {
    pickSeqRef.current += 1;
    const seq = pickSeqRef.current;

    // Instant, local, no network. This is the whole first impression.
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const url = URL.createObjectURL(file);
    previewRef.current = url;
    setPreview(url);

    uploadDoneRef.current = false;
    artRef.current = null;

    try {
      const d = await downscaleImage(file);
      if (pickSeqRef.current !== seq) return; // superseded by a later pick
      artRef.current = { blob: d.blob, aspectRatio: d.aspectRatio };
    } catch {
      if (pickSeqRef.current !== seq) return;
      // Undecodable here (HEIC outside Safari, typically). Send the original —
      // the server accepts HEIC and resizes on its own side. Better a slower
      // upload than a form that refuses their photo.
      artRef.current = { blob: file, aspectRatio: null };
    }
  }, []);

  // --- upload ---------------------------------------------------------------
  const startUpload = useCallback(() => {
    const art = artRef.current;
    if (!art) return;
    const seq = pickSeqRef.current;
    if (inflightRef.current?.seq === seq) return; // already sending this pick
    inflightRef.current?.controller.abort();

    const controller = new AbortController();
    setUploading(true);
    const promise = upload_application_art(draftIdRef.current, seq, art.blob, controller.signal)
      .then(() => {
        if (pickSeqRef.current !== seq) return;
        uploadDoneRef.current = true;
      })
      .catch(() => {
        // Stay quiet. There is no photo on page 2 to attach an error to, and
        // submit will carry the bytes itself if this never landed.
        if (pickSeqRef.current !== seq) return;
        uploadDoneRef.current = false;
      })
      .finally(() => {
        if (pickSeqRef.current === seq) setUploading(false);
      });
    inflightRef.current = { seq, controller, promise };
  }, []);

  // --- username availability ------------------------------------------------
  useEffect(() => {
    const u = username.trim().toLowerCase();
    if (!u) {
      setUnameState("idle");
      return;
    }
    setUnameState("checking");
    const controller = new AbortController();
    const t = window.setTimeout(() => {
      check_username_available(u, controller.signal)
        .then((r) => setUnameState(r.available ? "free" : "taken"))
        .catch(() => setUnameState("idle"));
    }, 350);
    return () => {
      window.clearTimeout(t);
      controller.abort();
    };
  }, [username]);

  // --- navigation -----------------------------------------------------------
  const goNext = () => {
    if (!firstname.trim() || !lastname.trim()) {
      setError("your name, please");
      return;
    }
    if (!artRef.current && !preview) {
      setError("add a piece — anything at all");
      return;
    }
    setError(null);
    // Send now: page 2's typing is far more upload time than the pause before
    // this tap ever was.
    startUpload();
    setPage(1);
  };

  const goBack = () => {
    // The only path that can still produce an out-of-order upload, so close it
    // here rather than relying on the server's seq guard alone.
    inflightRef.current?.controller.abort();
    inflightRef.current = null;
    setUploading(false);
    setError(null);
    setPage(0);
  };

  // --- submit ---------------------------------------------------------------
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const uname = username.trim().toLowerCase();
    if (!uname) return setError("pick a username");
    if (unameState === "taken") return setError("that username is taken");
    if (password.length < MIN_PASSWORD) return setError(`password needs ${MIN_PASSWORD}+ characters`);
    if (!email.trim()) return setError("we need an email to reach you");

    setError(null);
    setSubmitting(true);
    try {
      // Wait on whatever is already in flight before deciding it failed.
      if (!uploadDoneRef.current && inflightRef.current) {
        await inflightRef.current.promise.catch(() => {});
      }
      // Still not there: send it now. The bytes have been in memory since they
      // picked, so this is an ordinary upload, not a re-encode.
      if (!uploadDoneRef.current && artRef.current) {
        await upload_application_art(draftIdRef.current, pickSeqRef.current, artRef.current.blob);
        uploadDoneRef.current = true;
      }

      await submit_application({
        firstname: firstname.trim(),
        lastname: lastname.trim(),
        email: email.trim(),
        city: city.trim() || undefined,
        username: uname,
        password,
        invite_token: inviteToken || undefined,
        art_draft_id: draftIdRef.current,
        art_aspect_ratio: artRef.current?.aspectRatio ?? undefined,
      });
      setSubmitted(true);
      onSubmitted?.();
    } catch (err) {
      const msg = (err as Error).message || "something went wrong";
      if (msg === "art_missing") {
        setError("your piece didn't finish uploading — go back and re-add it");
      } else if (/is taken/.test(msg)) {
        setUnameState("taken");
        setError(msg);
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flow-root" ref={rootRef}>
        <div className="flow-panel flow-done">
          <p className="flow-done-title">you're in the queue, @{username.trim().toLowerCase()}.</p>
          <p className="flow-done-sub">
            A member reads every application. Once you're approved, log in with the username and
            password you just picked — there's no code to wait for.
          </p>
          {onClose && (
            <button className="flow-done-close" onClick={onClose}>
              done
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flow-root" ref={rootRef}>
      <div className="flow-panel">
        <div className="flow-head">
          <span className="flow-title">-• Painting Club •-</span>
          <span className="flow-step">{page === 0 ? "1 of 2" : "2 of 2"}</span>
          {onClose && (
            <button className="flow-x" onClick={onClose} aria-label="close">
              x
            </button>
          )}
        </div>

        <div className="flow-track" style={{ transform: `translateX(${page * -50}%)` }}>
          {/* ---------------- page 1 ---------------- */}
          <section className="flow-page" aria-hidden={page !== 0}>
            <div className="flow-row">
              <input
                className="flow-input"
                placeholder="first name"
                autoComplete="given-name"
                value={firstname}
                onChange={(e) => setFirstname(e.target.value)}
              />
              <input
                className="flow-input"
                placeholder="last name"
                autoComplete="family-name"
                value={lastname}
                onChange={(e) => setLastname(e.target.value)}
              />
            </div>
            <input
              className="flow-input"
              placeholder="city"
              autoComplete="address-level2"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />

            <button
              type="button"
              className={`flow-art${preview ? " has-art" : ""}`}
              onClick={() => fileInputRef.current?.click()}
            >
              {preview ? (
                <>
                  <img className="flow-art-img" src={preview} alt="your piece" />
                  {uploading && <span className="flow-art-bar" />}
                  <span className="flow-art-change">change</span>
                </>
              ) : (
                <span className="flow-art-empty">+ add a piece</span>
              )}
            </button>
            <p className="flow-note">a stick figure on a post it note is more than enough</p>

            <input
              ref={fileInputRef}
              className="flow-file"
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPick(f);
                // Reset so picking the same file twice still fires onChange.
                e.target.value = "";
              }}
            />

            <div className="flow-err" aria-live="polite">
              {page === 0 ? error : ""}
            </div>
            <button type="button" className="flow-primary" onClick={goNext}>
              next
            </button>
          </section>

          {/* ---------------- page 2 ---------------- */}
          <section className="flow-page" aria-hidden={page !== 1}>
            <form className="flow-form" onSubmit={submit} noValidate>
              <div className="flow-field">
                <input
                  className="flow-input"
                  placeholder="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
                <span className={`flow-hint flow-hint-${unameState}`}>
                  {unameState === "taken" ? "taken" : unameState === "free" ? "free" : ""}
                </span>
              </div>
              <input
                className="flow-input"
                type="password"
                placeholder="password (8+ characters)"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <input
                className="flow-input"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                placeholder="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className="flow-note">where we'll reach you when your account is approved</p>

              <div className="flow-err" aria-live="polite">
                {page === 1 ? error : ""}
              </div>
              <div className="flow-actions">
                <button type="button" className="flow-secondary" onClick={goBack}>
                  back
                </button>
                <button type="submit" className="flow-primary" disabled={submitting}>
                  {submitting ? "sending…" : "submit"}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
