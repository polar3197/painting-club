import "../../styles/stamp-banner.css";

// The title as a row of rubber-stamped words: several passes in different
// heavy grotesques, letters overlapping and slightly off-kilter, translucent,
// with a grain filter so the edges read as ink rather than vector. Every
// offset comes from a seeded hash, so the arrangement is stable between
// renders and reloads.
const WORDS = ["PAINT", "CLUB"];
const FONTS = [
  "'Archivo Black', 'Arial Black', sans-serif",
  "'Anton', 'Arial Narrow', sans-serif",
  "'Rubik', 'Arial Black', sans-serif",
  "'Work Sans', 'Arial Black', sans-serif",
  "'Passion One', 'Arial Black', sans-serif",
];
const PASSES = 4; // how many times the title is stamped across the band

// Small deterministic hash -> [0, 1).
function rnd(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export default function StampBanner() {
  const passes = Array.from({ length: PASSES }, (_, p) => p);
  return (
    <div className="stamp-band" aria-label="Paint Club">
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <filter id="stamp-grain" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
          <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -0.8 1.15" result="speckle" />
          <feComposite in="SourceGraphic" in2="speckle" operator="in" />
        </filter>
      </svg>
      {passes.map((p) => (
        <span key={p} className="stamp-pass" style={{ fontFamily: FONTS[p % FONTS.length], opacity: 0.18 + rnd(p + 40) * 0.14 }}>
          {WORDS.map((word, w) => (
            <span key={w} className="stamp-word">
              {word.split("").map((ch, i) => {
                const seed = p * 100 + w * 20 + i;
                const rot = (rnd(seed) - 0.5) * 6;           // ±3°
                const dy = (rnd(seed + 1) - 0.5) * 0.1;       // ±0.05em
                const ink = 0.85 + rnd(seed + 2) * 0.15;      // per-letter ink weight
                return (
                  <span key={i} className="stamp-letter" style={{ transform: `translateY(${dy}em) rotate(${rot}deg)`, opacity: ink }}>
                    {ch}
                  </span>
                );
              })}
            </span>
          ))}
        </span>
      ))}
    </div>
  );
}
