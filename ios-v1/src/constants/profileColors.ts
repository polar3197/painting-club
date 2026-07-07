import { Colors } from './theme';

// Per-component profile page colors. Each key is one recolorable component of
// a member's profile page; the 7 buttons on the edit-profile color tab map
// 1:1 to these. Borders stay black app-wide — these are fills (plus the pic
// frame, which is the one colored border the page already had).
export interface ProfilePageColors {
  bg: string;               // page background
  statementBox: string;     // artist statement card fill
  mediaTab: string;         // unselected media tab fill
  mediaTabSelected: string; // selected media tab fill
  picFrame: string;         // border around the profile picture
  artCardBg: string;        // art element card fill
  actionBtn: string;        // owner options buttons (gear/pencil/mail/share)
  // Name + location text color. The backend's profile_colors validator only
  // accepts the 7 keys above, so this one has no storage slot of its own — it
  // rides along inside picFrame (see packFrameAndName / decodeStoredColors).
  nameText: string;
}

// What the profile page renders today — the fallback for members who never
// customized.
export const DEFAULT_PROFILE_COLORS: ProfilePageColors = {
  bg: Colors.mainBg,
  statementBox: Colors.mainBg,
  mediaTab: Colors.secondary,
  mediaTabSelected: Colors.primaryGold,
  picFrame: Colors.primaryGold,
  artCardBg: Colors.white,
  actionBtn: Colors.white,
  nameText: Colors.textPrimary,
};

// The 8 component buttons, in display order. Labels are squeezed under the
// narrow buttons, hence the shorthand. 'name' has no backend key of its own —
// it's packed into picFrame at save time (see below).
export const PROFILE_COLOR_ELEMENTS: { key: keyof ProfilePageColors; label: string }[] = [
  { key: 'bg', label: 'bg' },
  { key: 'statementBox', label: 'bio' },
  { key: 'mediaTab', label: 'tabs' },
  { key: 'mediaTabSelected', label: 'sel' },
  { key: 'picFrame', label: 'frame' },
  { key: 'artCardBg', label: 'art' },
  { key: 'actionBtn', label: 'btns' },
  { key: 'nameText', label: 'name' },
];

// --- Color math for the HSV picker on the color tab ---
// Colors travel as strings ('#rrggbb' from the picker, 'rgb(r, g, b)' in the
// theme defaults); the picker works in HSV, so we convert both ways.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsv {
  h: number; // 0..360
  s: number; // 0..1
  v: number; // 0..1
}

export function parseColorToRgb(c: string): Rgb {
  if (c.startsWith('#')) {
    let hex = c.slice(1);
    if (hex.length === 3) hex = hex.split('').map((ch) => ch + ch).join('');
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b] = m[1].split(',').map((n) => parseInt(n.trim(), 10));
    return { r, g, b };
  }
  return { r: 255, g: 255, b: 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const to2 = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / d) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / d + 2);
    else h = 60 * ((rn - gn) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rn = 0, gn = 0, bn = 0;
  if (h < 60) [rn, gn, bn] = [c, x, 0];
  else if (h < 120) [rn, gn, bn] = [x, c, 0];
  else if (h < 180) [rn, gn, bn] = [0, c, x];
  else if (h < 240) [rn, gn, bn] = [0, x, c];
  else if (h < 300) [rn, gn, bn] = [x, 0, c];
  else [rn, gn, bn] = [c, 0, x];
  return { r: (rn + m) * 255, g: (gn + m) * 255, b: (bn + m) * 255 };
}

// --- Packing two colors into one storage slot ---
// The backend's profile_colors validator only allows 7 fixed keys, each a
// single color string ('#rgb' | '#rrggbb' | 'rgb(r, g, b)'). To give members a
// name-text color without a schema change, we smuggle it inside picFrame: two
// 12-bit (rgb444) colors pack into the 24 bits of an 'rgb(b0, b1, b2)' triple.
// 12-bit loses a little precision (each channel snaps to a multiple of 17), but
// both colors survive a round trip. We only pay that cost when the member
// actually sets a name color — otherwise picFrame stays a plain, full-precision
// hex string, exactly as before.

// Quantize an 8-bit channel to 4 bits; expand back by nibble-doubling
// (0xa -> 0xaa) so 0x0..0xf map across the full 0..255 range.
function rgbTo12(rgb: Rgb): number {
  const q = (n: number) => Math.max(0, Math.min(15, Math.round((n / 255) * 15)));
  return (q(rgb.r) << 8) | (q(rgb.g) << 4) | q(rgb.b);
}
function rgb12ToRgb(v: number): Rgb {
  const e = (n: number) => (n << 4) | n;
  return { r: e((v >> 8) & 0xf), g: e((v >> 4) & 0xf), b: e(v & 0xf) };
}

// frame + name -> 'rgb(b0, b1, b2)'. Only this format is written by the packer,
// so on read an 'rgb(...)' picFrame unambiguously means "packed" (the app
// normalizes every other saved color to '#rrggbb').
export function packFrameAndName(frame: string, name: string): string {
  const combined = (rgbTo12(parseColorToRgb(frame)) << 12) | rgbTo12(parseColorToRgb(name));
  const b0 = (combined >> 16) & 0xff;
  const b1 = (combined >> 8) & 0xff;
  const b2 = combined & 0xff;
  return `rgb(${b0}, ${b1}, ${b2})`;
}

const PACKED_RE = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/;

// Returns the two unpacked colors, or null if `stored` isn't a packed triple
// (i.e. it's a legacy plain hex frame color).
export function unpackFrameAndName(stored: string): { picFrame: string; nameText: string } | null {
  const m = stored.match(PACKED_RE);
  if (!m) return null;
  const combined = ((+m[1] & 0xff) << 16) | ((+m[2] & 0xff) << 8) | (+m[3] & 0xff);
  return {
    picFrame: rgbToHex(rgb12ToRgb((combined >> 12) & 0xfff)),
    nameText: rgbToHex(rgb12ToRgb(combined & 0xfff)),
  };
}

// Storage boundary: turn the raw stored 7-key object into the in-app 8-key
// partial (spread over DEFAULT_PROFILE_COLORS by callers). Splits a packed
// picFrame back into picFrame + nameText.
export function decodeStoredColors(
  stored: Record<string, string> | null | undefined,
): Partial<ProfilePageColors> {
  if (!stored) return {};
  const out: Partial<ProfilePageColors> = { ...(stored as Partial<ProfilePageColors>) };
  if (typeof stored.picFrame === 'string') {
    const unpacked = unpackFrameAndName(stored.picFrame);
    if (unpacked) {
      out.picFrame = unpacked.picFrame;
      out.nameText = unpacked.nameText;
    }
    // else: legacy plain frame color — leave picFrame, nameText stays default.
  }
  return out;
}

// Storage boundary: turn the in-app 8-key colors into the 7-key object the
// backend accepts. nameText is folded into picFrame; every other color is
// normalized to '#rrggbb'. picFrame is only packed (and quantized) when the
// member set a non-default name color, so unaffected members keep exact colors.
export function encodeColorsForStorage(colors: ProfilePageColors): Record<string, string> {
  const nameHex = rgbToHex(parseColorToRgb(colors.nameText));
  const defaultNameHex = rgbToHex(parseColorToRgb(DEFAULT_PROFILE_COLORS.nameText));
  const nameCustomized = nameHex !== defaultNameHex;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(colors)) {
    if (k === 'nameText') continue; // packed into picFrame, never its own key
    if (k === 'picFrame') {
      out.picFrame = nameCustomized
        ? packFrameAndName(colors.picFrame, colors.nameText)
        : rgbToHex(parseColorToRgb(colors.picFrame));
    } else {
      out[k] = rgbToHex(parseColorToRgb(v));
    }
  }
  return out;
}
