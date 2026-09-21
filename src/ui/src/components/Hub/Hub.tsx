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

const BAND = 18; // seam band thickness (matches --hub-band in hub.css)

// Web twin of the iOS swipe hub (ios-v1 SwipeHub): Home in the middle, art
// wall up, events down, your profile left, people right. Nested CSS
// scroll-snap containers do the swiping — finger on phones, trackpad on
// laptops — and each panel scrolls its own content with overscroll contained,
// so reading a panel never drags the hub.
//
// Each neighbor has ONE label band (its name, Home green) riding the seam
// between Home and that panel: at Home's edge on Home, travelling with the
// seam mid-swipe, the band on the panel's Home-facing edge on arrival. Panels
// are laid out beside their band, not under it. Clicking a band opens its
// panel from Home and returns Home from the panel.
export default function Hub() {
  const navigate = useNavigate();
  const { currentUser } = useAuth()!;
  const vRef = useRef<HTMLDivElement>(null);
  const hRef = useRef<HTMLDivElement>(null);
  const bandRefs = useRef<Record<Side, HTMLButtonElement | null>>({ top: null, bottom: null, left: null, right: null });

  // Same seam math as the iOS hub: vertical-seam bands ride the seam on y and
  // the Home column on x; horizontal-seam bands the reverse. Linear between
  // pages, so each band sits at Home's edge on Home and the panel's edge there.
  const placeBands = useCallback(() => {
    const v = vRef.current, h = hRef.current;
    if (!v || !h) return;
    const H = v.clientHeight, W = h.clientWidth, B = BAND;
    const y = v.scrollTop, x = h.scrollLeft;
    // value at t, moving linearly from c (at t=a) to d (at t=b)
    const lerp = (t: number, a: number, b: number, c: number, d: number) => c + ((t - a) * (d - c)) / (b - a);
    const colX = W - x; // Home column's left edge
    const rowY = H - y; // middle row's top edge
    // y in [0,H] and [H,2H] are both linear with these endpoints:
    const topY = y <= H ? lerp(y, 0, H, H - B, 0) : lerp(y, H, 2 * H, 0, -H);
    const botY = y <= H ? lerp(y, 0, H, 2 * H, H - B) : lerp(y, H, 2 * H, H - B, 0);
    const leftX = x <= W ? lerp(x, 0, W, W - B, 0) : lerp(x, W, 2 * W, 0, -W);
    const rightX = x <= W ? lerp(x, 0, W, 2 * W, W - B) : lerp(x, W, 2 * W, W - B, 0);
    const set = (s: Side, tx: number, ty: number) => {
      const el = bandRefs.current[s];
      if (el) el.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
    };
    set("top", colX, topY);
    set("bottom", colX, botY);
    set("left", leftX, rowY);
    set("right", rightX, rowY);
  }, []);
  const frame = useRef(0);
  const onScroll = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(placeBands);
  }, [placeBands]);

  // Open on Home, and keep it there across resizes/rotations.
  const center = useCallback(() => {
    const v = vRef.current, h = hRef.current;
    if (v) v.scrollTo({ top: v.clientHeight, behavior: "instant" as ScrollBehavior });
    if (h) h.scrollTo({ left: h.clientWidth, behavior: "instant" as ScrollBehavior });
    placeBands();
  }, [placeBands]);
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

  // Clicking a band: from Home it opens that panel; on the panel it returns.
  const tapBand = (side: Side) => {
    const v = vRef.current, h = hRef.current;
    if (!v || !h) return;
    const vp = Math.round(v.scrollTop / v.clientHeight), hp = Math.round(h.scrollLeft / h.clientWidth);
    const here = vp === 0 ? "top" : vp === 2 ? "bottom" : hp === 0 ? "left" : hp === 2 ? "right" : "home";
    go(here === side ? "home" : side);
  };

  const bands: { side: Side; label: string }[] = [
    { side: "top", label: "art wall" },
    { side: "bottom", label: "events" },
    { side: "left", label: "profile" },
    { side: "right", label: "people" },
  ];

  return (
    <>
      <div className="hub" ref={vRef} onScroll={onScroll}>
        <section className="hub-panel hub-panel-artwall">
          <div className="hub-panel-scroll"><ArtWall /></div>
        </section>

        <div className="hub-row" ref={hRef} onScroll={onScroll}>
          <section className="hub-panel hub-panel-profile">
            <div className="hub-panel-scroll">
              {currentUser ? <UserProfile username={currentUser} /> : null}
            </div>
          </section>

          <section className="hub-panel hub-home">
            <button className="hub-title" onClick={() => navigate("/about")}>paint club</button>
          </section>

          <section className="hub-panel hub-panel-people">
            <div className="hub-panel-scroll"><People /></div>
          </section>
        </div>

        <section className="hub-panel hub-panel-events">
          <div className="hub-panel-scroll hub-events"><EventsBox /></div>
        </section>
      </div>

      {bands.map(({ side, label }) => (
        <button
          key={side}
          ref={(el) => { bandRefs.current[side] = el; }}
          className={`hub-band hub-band-${side}`}
          onClick={() => tapBand(side)}
          aria-label={label}
        >
          {side === "left" || side === "right" ? <Stacked word={label} /> : label}
        </button>
      ))}
    </>
  );
}

function Stacked({ word }: { word: string }) {
  return <span className="hub-stacked">{word.split("").map((ch, i) => <span key={i}>{ch === " " ? " " : ch}</span>)}</span>;
}

