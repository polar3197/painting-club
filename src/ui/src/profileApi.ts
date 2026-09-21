// Client calls the profile page needs to match the iOS app: bookmarks, wall
// pins, the owner's comments-received feed, and audio pieces. Kept out of
// api.ts so parallel work there doesn't collide; same /api base + bearer.
import { getToken } from "./session";

const API_BASE = "/api";

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const data = res.headers.get("content-type")?.includes("application/json") ? await res.json() : null;
  if (!res.ok) {
    const detail = (data as { detail?: unknown } | null)?.detail;
    throw new Error(typeof detail === "string" ? detail : `Request failed (${res.status})`);
  }
  return data as T;
}

// --- bookmarks ---------------------------------------------------------------

export interface BookmarkedArtOut {
  art_id: string;
  title: string;
  art_type: string;
  medium: string;
  file_path: string | null;
  creator_username: string;
  series_id: string | null;
  bookmarked_at: string;
}

export const list_my_bookmarks = () => call<BookmarkedArtOut[]>("/members/me/bookmarks");
export const add_bookmark = (artId: string) => call<{ ok: boolean }>(`/art/${artId}/bookmark`, { method: "POST" });
export const remove_bookmark = (artId: string) => call<{ ok: boolean }>(`/art/${artId}/bookmark`, { method: "DELETE" });

// --- wall pins ---------------------------------------------------------------

export type WallType = "visual_2d" | "written_form" | "audio";
export interface WallPin { username: string; art_type: WallType; art_id: string }

export const list_wall_pins = () => call<WallPin[]>("/wall-pins");
export const toggle_wall_pin = (artId: string) => call<{ pinned: boolean }>(`/art/${artId}/wall-pin`, { method: "PUT" });

// --- comments received (owner's statement carousel, page 2) -------------------

export interface CommentReceivedOut {
  id: string;
  text: string;
  created_at: string;
  art_id: string;
  art_title: string | null;
  art_medium: string;
  commenter_username: string;
  commenter_firstname: string | null;
}

export interface CommentsReceivedPage {
  comments: CommentReceivedOut[];
  next_cursor: string | null;
  previous_view_at: string | null;
}

export function get_comments_received(cursor: string | null, limit = 20) {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (cursor) qs.set("cursor", cursor);
  return call<CommentsReceivedPage>(`/members/me/comments-received?${qs}`);
}

// --- audio -------------------------------------------------------------------

export interface AudioOut {
  id: string;
  title: string;
  date: string | null;
  keywords: string[] | null;
  file_path: string;
  comments_enabled: boolean;
  artist: string | null;
  duration_seconds: number | null;
  series_id: string | null;
  series_name: string | null;
  order_index: number | null;
}

export const get_members_audio = (username: string, medium: string) =>
  call<AudioOut[]>(`/members/${username}/art/audio/${encodeURIComponent(medium)}`);
export const remove_audio = (artId: string) => call<{ ok: boolean }>(`/art/audio/${artId}`, { method: "DELETE" });
