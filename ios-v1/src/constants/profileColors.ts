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
};

// The 7 component buttons, in display order. Labels are squeezed under
// 38px-wide buttons, hence the shorthand.
export const PROFILE_COLOR_ELEMENTS: { key: keyof ProfilePageColors; label: string }[] = [
  { key: 'bg', label: 'bg' },
  { key: 'statementBox', label: 'bio' },
  { key: 'mediaTab', label: 'tabs' },
  { key: 'mediaTabSelected', label: 'sel' },
  { key: 'picFrame', label: 'frame' },
  { key: 'artCardBg', label: 'art' },
  { key: 'actionBtn', label: 'btns' },
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
