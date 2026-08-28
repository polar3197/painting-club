import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ApplicationForm from "../Utils/ApplicationForm";
import "../../styles/join.css";

// Flyer QR landing (/join). A full standalone page — not the dialog-over-login
// overlay — so someone arriving cold from a printed QR gets a clean, single-
// purpose request-account screen. The submitted request still goes through the
// existing admin review flow (POST /apply -> /admin/applications).
const APP_STORE_URL = "https://apps.apple.com/app/id6762710261";

// iPadOS 13+ reports itself as a Mac; the touch-points check catches it.
const isIOS = () =>
  /iP(hone|ad|od)/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export default function Join() {
  const navigate = useNavigate();
  const [submitted, setSubmitted] = useState(false);
  const ios = isIOS();

  useEffect(() => {
    const prev = document.title;
    document.title = "join painting club";
    return () => { document.title = prev; };
  }, []);

  const appStoreLink = (extraClass = "") => (
    <a
      className={`join-appstore ${extraClass}`}
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
    >
      Get the app on the App Store
    </a>
  );

  return (
    <main className="join-wrapper">
      <div className="join-card">
        <div className="join-header">
          <div className="join-title">-• Painting Club •-</div>
          <p className="join-tagline">
            {submitted
              ? "Thanks for reaching out."
              : "A club for people who make things. Request an account to join."}
          </p>
        </div>

        {/* On iOS the app is the better home for a member, so lead with it —
            the web form stays right below as the always-available path. */}
        {ios && !submitted && (
          <div className="join-app-first">
            {appStoreLink("primary")}
            <span className="join-or">or request an account below</span>
          </div>
        )}

        <ApplicationForm onSubmitted={() => setSubmitted(true)} />

        <div className="join-footer">
          {!(ios && !submitted) && appStoreLink()}
          <button className="join-login-link" onClick={() => navigate("/landing-page")}>
            {submitted ? "back to log in" : "already a member? log in"}
          </button>
        </div>
      </div>
    </main>
  );
}
