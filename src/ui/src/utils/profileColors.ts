// Per-component profile page colors — a port of the iOS app's
// constants/profileColors.ts so both clients read and write the same
// profile_colors object. Keep the two in step.
export interface ProfilePageColors {
  bg: string;               // page background
  statementBox: string;     // artist statement card fill
  mediaTab: string;         // unselected media tab fill
  mediaTabSelected: string; // selected media tab fill
  picFrame: string;         // border around the profile picture
  artCardBg: string;        // art element card fill
  actionBtn: string;        // owner options buttons (gear/pencil/mail/share)
  // Name + location text. The backend only accepts the 7 keys above, so this
  // one rides inside picFrame (packFrameAndName / decodeStoredColors).
  nameText: string;
}

// The iOS defaults — what a never-customized page wears there.
export const DEFAULT_PROFILE_COLORS: ProfilePageColors = {
  bg: "rgb(255, 250, 245)",
  statementBox: "rgb(255, 250, 245)",
  mediaTab: "rgb(250, 244, 202)",
  mediaTabSelected: "rgb(238, 190, 100)",
  picFrame: "rgb(238, 190, 100)",
  artCardBg: "#fff",
  actionBtn: "#fff",
  nameText: "#000",
};

export const PROFILE_COLOR_ELEMENTS: { key: keyof ProfilePageColors; label: string }[] = [
  { key: "bg", label: "bg" },
  { key: "statementBox", label: "bio" },
  { key: "mediaTab", label: "tabs" },
  { key: "mediaTabSelected", label: "sel" },
  { key: "picFrame", label: "frame" },
  { key: "artCardBg", label: "art" },
  { key: "actionBtn", label: "btns" },
  { key: "nameText", label: "name" },
];

export interface Rgb { r: number; g: number; b: number }

export function parseColorToRgb(c: string): Rgb {
  if (c.startsWith("#")) {
    let hex = c.slice(1);
    if (hex.length === 3) hex = hex.split("").map((ch) => ch + ch).join("");
    return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b] = m[1].split(",").map((n) => parseInt(n.trim(), 10));
    return { r, g, b };
  }
  return { r: 255, g: 255, b: 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const to2 = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

// --- Packing two colors into one storage slot (see the iOS file for why) ---
function rgbTo12(rgb: Rgb): number {
  const q = (n: number) => Math.max(0, Math.min(15, Math.round((n / 255) * 15)));
  return (q(rgb.r) << 8) | (q(rgb.g) << 4) | q(rgb.b);
}
function rgb12ToRgb(v: number): Rgb {
  const e = (n: number) => (n << 4) | n;
  return { r: e((v >> 8) & 0xf), g: e((v >> 4) & 0xf), b: e(v & 0xf) };
}

export function packFrameAndName(frame: string, name: string): string {
  const combined = (rgbTo12(parseColorToRgb(frame)) << 12) | rgbTo12(parseColorToRgb(name));
  return `rgb(${(combined >> 16) & 0xff}, ${(combined >> 8) & 0xff}, ${combined & 0xff})`;
}

const PACKED_RE = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/;

export function unpackFrameAndName(stored: string): { picFrame: string; nameText: string } | null {
  const m = stored.match(PACKED_RE);
  if (!m) return null;
  const combined = ((+m[1] & 0xff) << 16) | ((+m[2] & 0xff) << 8) | (+m[3] & 0xff);
  return { picFrame: rgbToHex(rgb12ToRgb((combined >> 12) & 0xfff)), nameText: rgbToHex(rgb12ToRgb(combined & 0xfff)) };
}

/** Stored 7-key object -> in-app 8-key partial (spread over the defaults). */
export function decodeStoredColors(stored: Record<string, string> | null | undefined): Partial<ProfilePageColors> {
  if (!stored) return {};
  const out: Partial<ProfilePageColors> = { ...(stored as Partial<ProfilePageColors>) };
  if (typeof stored.picFrame === "string") {
    const unpacked = unpackFrameAndName(stored.picFrame);
    if (unpacked) { out.picFrame = unpacked.picFrame; out.nameText = unpacked.nameText; }
  }
  return out;
}

/** In-app 8 keys -> the 7-key object the backend accepts. */
export function encodeColorsForStorage(colors: ProfilePageColors): Record<string, string> {
  const nameHex = rgbToHex(parseColorToRgb(colors.nameText));
  const nameCustomized = nameHex !== rgbToHex(parseColorToRgb(DEFAULT_PROFILE_COLORS.nameText));
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(colors)) {
    if (k === "nameText") continue;
    if (k === "picFrame") out.picFrame = nameCustomized ? packFrameAndName(colors.picFrame, colors.nameText) : rgbToHex(parseColorToRgb(colors.picFrame));
    else out[k] = rgbToHex(parseColorToRgb(v));
  }
  return out;
}

/** Resolved colors as CSS custom properties for the profile page. */
export function profileColorVars(stored: Record<string, string> | null | undefined): React.CSSProperties {
  const c = { ...DEFAULT_PROFILE_COLORS, ...decodeStoredColors(stored) };
  return {
    "--pc-bg": c.bg,
    "--pc-statement": c.statementBox,
    "--pc-tab": c.mediaTab,
    "--pc-tab-selected": c.mediaTabSelected,
    "--pc-frame": c.picFrame,
    "--pc-art": c.artCardBg,
    "--pc-btn": c.actionBtn,
    "--pc-name": c.nameText,
  } as React.CSSProperties;
}
