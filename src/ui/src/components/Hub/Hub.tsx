import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import UserProfile from "../Pages/UserProfile";
import People from "../Pages/People";
import EventsBox from "../Home/EventsBox";
import ArtWall from "./ArtWall";
import "../../styles/home.css";
import "../../styles/hub.css";

type Side = "top" | "bottom" | "left" | "right";

// Web twin of the iOS swipe hub (ios-v1 SwipeHub): Home in the middle, art
// wall up, events down, your profile left, people right. Nested CSS
// scroll-snap containers do the swiping — finger on phones, trackpad on
// laptops — and each panel scrolls its own content with overscroll contained,
// so reading a panel never drags the hub. Home's edge labels jump to their
// panel; each panel's green band (carrying the same label) jumps back.
export default function Hub() {
  const navigate = useNavigate();
  const { currentUser } = useAuth()!;
  const vRef = useRef<HTMLDivElement>(null);
  const hRef = useRef<HTMLDivElement>(null);

  // Open on Home, and keep it there across resizes/rotations.
  const center = useCallback(() => {
    const v = vRef.current, h = hRef.current;
    if (v) v.scrollTo({ top: v.clientHeight, behavior: "instant" as ScrollBehavior });
    if (h) h.scrollTo({ left: h.clientWidth, behavior: "instant" as ScrollBehavior });
  }, []);
  useLayoutEffect(center, [center]);
  useEffect(() => {
    window.addEventListener("resize", center);
    return () => window.removeEventListener("resize", center);
  }, [center]);

  const go = useCallback((side: Side | "home") => {
    const v = vRef.current, h = hRef.current;
    if (!v || !h) return;
    if (side === "home") {
      v.scrollTo({ top: v.clientHeight, behavior: "smooth" });
      h.scrollTo({ left: h.clientWidth, behavior: "smooth" });
    } else if (side === "top") v.scrollTo({ top: 0, behavior: "smooth" });
    else if (side === "bottom") v.scrollTo({ top: v.clientHeight * 2, behavior: "smooth" });
    else if (side === "left") h.scrollTo({ left: 0, behavior: "smooth" });
    else h.scrollTo({ left: h.clientWidth * 2, behavior: "smooth" });
  }, []);

  // Arrow keys on Home step to a neighbor (desktop).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = vRef.current, h = hRef.current;
      if (!v || !h || (e.target as HTMLElement)?.closest("input, textarea, [contenteditable]")) return;
      const onHome = Math.round(v.scrollTop / v.clientHeight) === 1 && Math.round(h.scrollLeft / h.clientWidth) === 1;
      if (!onHome) { if (e.key === "Escape") go("home"); return; }
      const map: Record<string, Side> = { ArrowUp: "top", ArrowDown: "bottom", ArrowLeft: "left", ArrowRight: "right" };
      if (map[e.key]) { e.preventDefault(); go(map[e.key]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  return (
    <div className="hub" ref={vRef}>
      <section className="hub-panel">
        <div className="hub-panel-scroll"><ArtWall /></div>
        <HomeBand side="bottom" label="art wall" onHome={() => go("home")} />
      </section>

      <div className="hub-row" ref={hRef}>
        <section className="hub-panel">
          <div className="hub-panel-scroll">
            {currentUser ? <UserProfile username={currentUser} /> : null}
          </div>
          <HomeBand side="right" label="profile" onHome={() => go("home")} />
        </section>

        <section className="hub-panel hub-home">
          <button className="hub-title" onClick={() => navigate("/about")}>paint club</button>
          <button className="hub-edge hub-edge-top" onClick={() => go("top")}>art wall</button>
          <button className="hub-edge hub-edge-bottom" onClick={() => go("bottom")}>events</button>
          <button className="hub-edge hub-edge-left" onClick={() => go("left")}><Stacked word="profile" /></button>
          <button className="hub-edge hub-edge-right" onClick={() => go("right")}><Stacked word="people" /></button>
        </section>

        <section className="hub-panel">
          <div className="hub-panel-scroll hub-people"><People /></div>
          <HomeBand side="left" label="people" onHome={() => go("home")} />
        </section>
      </div>

      <section className="hub-panel">
        <div className="hub-panel-scroll hub-events"><EventsBox /></div>
        <HomeBand side="top" label="events" onHome={() => go("home")} />
      </section>
    </div>
  );
}

function Stacked({ word }: { word: string }) {
  return <span className="hub-stacked">{word.split("").map((ch, i) => <span key={i}>{ch === " " ? " " : ch}</span>)}</span>;
}

// Home's green on the panel edge that faces Home, carrying the panel's own
// name (the same word Home's edge shows). Click it to go back.
function HomeBand({ side, label, onHome }: { side: Side; label: string; onHome: () => void }) {
  const vertical = side === "left" || side === "right";
  return (
    <button className={`hub-band hub-band-${side}`} onClick={onHome} aria-label={`${label} — back to home`}>
      {vertical ? <Stacked word={label} /> : label}
    </button>
  );
}
