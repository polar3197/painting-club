export interface MonthCursor { y: number; m0: number }

const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (y: number, m0: number, d: number) => `${y}-${pad(m0 + 1)}-${pad(d)}`;

export function stepMonth(c: MonthCursor, delta: number): MonthCursor {
  let m0 = c.m0 + delta, y = c.y;
  if (m0 < 0) { m0 = 11; y -= 1; }
  if (m0 > 11) { m0 = 0; y += 1; }
  return { y, m0 };
}
