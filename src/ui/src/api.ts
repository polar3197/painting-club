import { getToken, clearSession } from "./session";

const API_BASE = "/api";

export function thumbUrl(artId: string): string {
  return `${API_BASE}/art/${artId}/thumb`;
}

/** Small JPEG placeholder for a member's profile pic. Served directly by nginx from
 *  /static/profile-thumbs/. Falls back silently (404) for members without a pic uploaded. */
export function profileThumbUrl(memberId: string): string {
  return `/static/profile-thumbs/${memberId}.jpg`;
}

/** Cache-busted URL for a member's profile pic — null if none uploaded.
 *  `versions` comes from AuthContext; it bumps when the current user re-uploads,
 *  so re-uploads of the same extension still force the browser to refetch. */
export function profilePicSrc(
  profile: { id: string; profile_pic_path: string | null },
  versions: Record<string, number> = {},
): string | null {
  if (!profile.profile_pic_path) return null;
  const v = versions[profile.id];
  return `${profile.profile_pic_path}${v ? `?v=${v}` : ''}`;
}

interface RequestOptions extends RequestInit {
  headers?: Record<string, string>;
}

async function request(path: string, options: RequestOptions = {}): Promise<unknown> {
  const isFormData = options.body instanceof FormData;
  // Attach the session token by default — the backend lockdown member-gated
  // routes this client still called bare (e.g. the per-medium art lists), and
  // any 401 below nukes the session. Explicit headers still win via spread.
  const token = getToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
        ...(!isFormData && { "Content-Type": "application/json" }),
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(options.headers || {}),
    },
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await response.json() : null;

  // Expired/invalid token on an authenticated request → clear session + kick to landing.
  // Skip the redirect for the login endpoint itself so bad-password attempts don't bounce the page.
  if (response.status === 401 && !path.startsWith("/members/login")) {
    clearSession();
    if (window.location.pathname !== "/landing-page") {
      window.location.href = "/landing-page";
    }
  }

  if (!response.ok) {
    const detail = (data as any)?.detail;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail) || `Request failed with status ${response.status}`);
  }

  return data;
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  must_setup?: boolean;
}

export interface SetupAccountIn {
  new_username: string;
  new_password: string;
}

// Redeem a one-time setup code (handed out by an admin) for a temp-account
// token. Mirrors the iOS landing-page secret-code flow.
export function redeem_setup_code(code: string): Promise<LoginResponse> {
  return request("/members/redeem-setup-code", {
    method: "POST",
    body: JSON.stringify({ code }),
  }) as Promise<LoginResponse>;
}

export function setup_account(payload: SetupAccountIn, token: string | null): Promise<{ id: string; username: string }> {
  return request("/members/setup-account", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(payload),
  }) as Promise<{ id: string; username: string }>;
}

export interface Profile {
  id: string;
  username: string;
  firstname: string;
  lastname: string;
  city: string;
  state: string;
  bio:string;
  is_owner: boolean;
  media: string[];
  hidden_media: string[];
  role: string;
  profile_pic_path: string | null;
  viewer_blocked_by_owner?: boolean;
  blocked_usernames?: string[] | null;
}

export interface ReportOut {
  id: string;
  reporter_username: string;
  target_type: 'art' | 'comment';
  target_id: string;
  target_preview: string | null;
  reason: string | null;
  status: string;
  created_at: string;
}

export interface ApplicationIn {
  firstname: string;
  lastname: string;
  email: string;
  city?: string;
  state?: string;
  known_member?: string;
  reason?: string;
}

export interface ApplicationOut {
  id: string;
  firstname: string;
  lastname: string;
  email: string;
  city: string | null;
  state: string | null;
  known_member: string | null;
  reason: string | null;
  status: string;
  created_at: string;
  temp_username?: string | null;
  temp_password?: string | null;
}

export interface ApplicationApproveOut {
  application_id: string;
  status: string;
  temp_username: string;
  temp_password: string;
  temp_password_expires_at: string;
}

export function submit_application(payload: ApplicationIn): Promise<unknown> {
  return request("/apply", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function get_applications(token: string | null): Promise<ApplicationOut[]> {
  return request("/admin/applications", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }) as Promise<ApplicationOut[]>;
}

export function update_application_status(id: string, status: string, token: string | null): Promise<ApplicationApproveOut | { ok: true }> {
  return request(`/admin/applications/${id}`, {
    method: "PATCH",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify({ status }),
  }) as Promise<ApplicationApproveOut | { ok: true }>;
}

export function delete_application(id: string, token: string | null): Promise<{ ok: true }> {
  return request(`/admin/applications/${id}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }) as Promise<{ ok: true }>;
}

export interface Visual2DIn {
  username: string;
  medium: string;
  title: string;
  date?: string;
  location?: string;
  song?: string;
  song_artist?: string;
  height?: number | null;
  width?: number | null;
  keywords?: string;
  comments_enabled?: boolean;
  collection_id?: string | null;
  file: File;
}

export interface Visual2DOut {
  id: string;
  username: string;
  medium: string;
  title: string;
  date: string
  location: string;
  song: string;
  song_artist: string;
  height: number;
  width: number;
  keywords: string[];
  file_path: string;
  comments_enabled: boolean;
  aspect_ratio: number | null;
}

export function getHealth(): Promise<unknown> {
  return request("/health");
}

export function getUsers(): Promise<unknown> {
  return request("/members");
}

export function createUser(payload: LoginPayload): Promise<unknown> {
  return request("/members/new", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function login_user(payload: LoginPayload): Promise<LoginResponse> {
  const normalized = { ...payload, username: payload.username.toLowerCase() };
  return request("/members/login", {
    method: "POST",
    body: JSON.stringify(normalized),
  }) as Promise<LoginResponse>;
}

/** Sliding session: swap a still-valid token for a fresh one (see AuthContext). */
export function refresh_token(token: string): Promise<LoginResponse> {
  return request("/members/refresh-token", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<LoginResponse>;
}

export function get_profile(username: string, token: string | null): Promise<Profile> {
  return request(`/members/${username}/profile`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }) as Promise<Profile>;
}

export function get_profiles(): Promise<Profile[]> {
  return request(`/members/all/profile`) as Promise<Profile[]>;
}

export function upload_profile_picture(file: File, token: string | null): Promise<{ profile_pic_path: string }> {
  const fd = new FormData();
  fd.append("file", file);
  return request(`/members/profile-picture`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  }) as Promise<{ profile_pic_path: string }>;
}

export function update_profile(username: string, payload: Profile, token: string | null) {
  return request(`/members/${username}/update-profile`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export interface MediaType {
  id: string;
  name: string;
  type?: string | null;
}

export function get_media(): Promise<MediaType[]> {
  return request(`/media`) as Promise<MediaType[]>;
}

export function add_member_media(username: string, medium: string, token: string | null) {
  return request(`/members/addmedia`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ username, medium }),
  });
}

export function set_media_visibility(medium: string, hidden: boolean, token: string | null) {
  return request(`/members/media/${encodeURIComponent(medium)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ hidden }),
  });
}

export interface MediaRequest {
  id: string;
  member_id: string;
  username: string;
  requested_name: string;
  status: string;
  resolved_type: string | null;
  created_at: string;
}

export function submit_media_request(name: string, token: string | null): Promise<MediaRequest> {
  return request(`/media-requests`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name }),
  }) as Promise<MediaRequest>;
}

export function get_media_requests(token: string | null): Promise<MediaRequest[]> {
  return request(`/admin/media-requests`, {
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<MediaRequest[]>;
}

export function update_media_request(
  id: string,
  status: "approved" | "rejected",
  type: string | null,
  token: string | null,
  name: string | null = null,
): Promise<MediaRequest> {
  return request(`/admin/media-requests/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status, type, name }),
  }) as Promise<MediaRequest>;
}

export function get_members(city: string, uname: string, token: string | null): Promise<Profile[]> {
  const params = new URLSearchParams({ city, uname });
  const members = request(`/members?${params}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }) as Promise<Profile[]>;
  return members;
}

export interface SearchOptions {
  usernames: string[];
  fullnames: string[];
  cities: string[];
  keywords: string[];
  titles: string[];
  songs: string[];
  mediums: string[];
}

export interface ArtResult {
  id: string;
  title: string;
  medium: string;
  keywords: string[];
  song: string | null;
  file_path: string;
  date: string | null;
  location: string | null;
  creator_username: string;
  creator_city: string | null;
  aspect_ratio: number | null;
}

export function get_search_options(medium?: string, username?: string): Promise<SearchOptions> {
  const params = new URLSearchParams();
  if (medium) params.set("medium", medium);
  if (username) params.set("username", username);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return request(`/members/search-options${qs}`) as Promise<SearchOptions>;
}

export function search_art(q: string): Promise<ArtResult[]> {
  return request(`/art/search?q=${encodeURIComponent(q)}`) as Promise<ArtResult[]>;
} 

export function add_new_visual_2d(token: string | null, payload: Visual2DIn) {
  const fd = new FormData();
  fd.append("username", payload.username);
  fd.append("medium", payload.medium);
  fd.append("title", payload.title);
  if (payload.date) fd.append("date", payload.date);
  if (payload.location) fd.append("location", payload.location);
  if (payload.song) fd.append("song", payload.song);
  if (payload.song_artist) fd.append("song_artist", payload.song_artist);
  if (payload.width != null) fd.append("width", String(payload.width));
  if (payload.height != null) fd.append("height", String(payload.height));
  if (payload.keywords != null) fd.append("keywords", String(payload.keywords));
  if (payload.comments_enabled != null) fd.append("comments_enabled", String(payload.comments_enabled));
  if (payload.collection_id) fd.append("collection_id", payload.collection_id);
  fd.append("file", payload.file);

  return request("/art/upload/visual-2d", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
}

export interface Visual2DUpdatePayload {
  title: string;
  date?: string | null;
  location?: string | null;
  song?: string | null;
  song_artist?: string | null;
  width?: number | null;
  height?: number | null;
  keywords?: string[] | null;
  comments_enabled?: boolean;
  medium?: string | null;
  // When set, the on-disk file (and thumbnail) gets replaced.
  file?: File | null;
}

export function update_visual_2d(id: string, token: string | null, payload: Visual2DUpdatePayload) {
  const fd = new FormData();
  fd.append("title", payload.title);
  if (payload.date) fd.append("date", payload.date);
  if (payload.location != null) fd.append("location", payload.location);
  if (payload.song != null) fd.append("song", payload.song);
  if (payload.song_artist != null) fd.append("song_artist", payload.song_artist);
  if (payload.width != null) fd.append("width", String(payload.width));
  if (payload.height != null) fd.append("height", String(payload.height));
  if (payload.keywords != null) fd.append("keywords", payload.keywords.join(", "));
  if (payload.comments_enabled != null) fd.append("comments_enabled", String(payload.comments_enabled));
  if (payload.medium) fd.append("medium", payload.medium);
  if (payload.file) fd.append("file", payload.file);
  return request(`/art/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
}

export function remove_visual_2d(id: string, token: string | null) {
  return request(`/art/${id}`, { method: 'DELETE' , headers: { Authorization: `Bearer ${token}` }});
}

export function get_members_visual_2d(username: string, medium: string): Promise<Visual2DOut[]> {
  return request(`/members/${username}/art/${medium}`) as Promise<Visual2DOut[]>;
}

export interface WrittenFormIn {
  username: string;
  medium: string;
  title: string;
  date?: string;
  keywords?: string;
  comments_enabled?: boolean;
  series_name?: string;
  // Provide exactly one of file or text.
  file?: File;
  text?: string;
  // Optional cover image shown on the piece's card instead of the text snippet.
  cover?: File;
}

export interface WrittenFormOut {
  id: string;
  title: string;
  date: string | null;
  keywords: string[];
  file_path: string;
  comments_enabled: boolean;
  series_id: string | null;
  series_name: string | null;
  order_index: number | null;
  // Optional image rendered as the piece's card instead of the text snippet.
  cover_image_path?: string | null;
}

export function add_new_written_form(token: string | null, payload: WrittenFormIn) {
  const fd = new FormData();
  fd.append("username", payload.username);
  fd.append("medium", payload.medium);
  fd.append("title", payload.title);
  if (payload.date) fd.append("date", payload.date);
  if (payload.keywords != null) fd.append("keywords", String(payload.keywords));
  if (payload.comments_enabled != null) fd.append("comments_enabled", String(payload.comments_enabled));
  if (payload.series_name) fd.append("series_name", payload.series_name);
  if (payload.file) fd.append("file", payload.file);
  if (payload.text) fd.append("text", payload.text);
  if (payload.cover) fd.append("cover", payload.cover);

  return request("/art/upload/written-form", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
}

export function get_members_written_form(username: string, medium: string): Promise<WrittenFormOut[]> {
  return request(`/members/${username}/art/written-form/${medium}`) as Promise<WrittenFormOut[]>;
}

export function remove_written_form(id: string, token: string | null) {
  return request(`/art/written-form/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` }});
}

export interface WrittenFormUpdatePayload {
  title: string;
  date?: string | null;
  keywords?: string[] | null;
  comments_enabled?: boolean;
  medium?: string | null;
  series_name?: string | null;
  clear_series?: boolean;
}

export function update_written_form(id: string, token: string | null, payload: WrittenFormUpdatePayload) {
  return request(`/art/written-form/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export function rename_series(id: string, name: string, token: string | null): Promise<{ id: string; name: string }> {
  return request(`/series/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name }),
  }) as Promise<{ id: string; name: string }>;
}

export function set_series_order(id: string, art_ids: string[], token: string | null): Promise<{ ok: true }> {
  return request(`/series/${id}/order`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ art_ids }),
  }) as Promise<{ ok: true }>;
}

export interface PromptOut {
  id: string;
  title: string;
  short_summary: string | null;
  media_id: string;
  media_name: string;
  is_active: boolean;
  submission_count: number;
}

export interface PromptDetailOut extends PromptOut {
  submissions: ArtResult[];
  viewer_submission_id: string | null;
}

export interface PromptSuggestionOut {
  id: string;
  username: string | null;
  media_id: string | null;
  media_name: string | null; // null = medium-agnostic
  prompt_text: string;
  status: string;
  order_index: number | null;
  created_at: string;
}

export interface AdminPromptQueueOut {
  proposed: PromptSuggestionOut[];
  up_next: PromptSuggestionOut[]; // approved queue, in order
}

export function get_admin_prompt_queue(token: string | null): Promise<AdminPromptQueueOut> {
  return request("/admin/weekly-prompts", {
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<AdminPromptQueueOut>;
}

export function review_prompt_suggestion(
  id: string,
  status: "approved" | "rejected",
  token: string | null,
): Promise<PromptSuggestionOut> {
  return request(`/admin/weekly-prompts/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  }) as Promise<PromptSuggestionOut>;
}

/** Make an approved suggestion this week's prompt (archives the current one). */
export function activate_suggestion(id: string, token: string | null): Promise<PromptOut> {
  return request(`/admin/weekly-prompts/${id}/activate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<PromptOut>;
}

export function get_active_prompt(token: string | null): Promise<PromptOut | null> {
  return request("/prompts/active", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }) as Promise<PromptOut | null>;
}

export function get_prompt(id: string, token: string | null): Promise<PromptDetailOut> {
  return request(`/prompts/${id}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }) as Promise<PromptDetailOut>;
}

export interface CommentOut {
  id: string;
  username: string;
  firstname: string | null;
  text: string;
  created_at: string;
}

export function get_comments(art_id: string, token: string | null): Promise<CommentOut[]> {
  return request(`/art/${art_id}/comments`, {
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<CommentOut[]>;
}

export function post_comment(art_id: string, text: string, token: string | null): Promise<CommentOut> {
  return request(`/art/${art_id}/comments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text }),
  }) as Promise<CommentOut>;
}

export function delete_comment(art_id: string, comment_id: string, token: string | null): Promise<void> {
  return request(`/art/${art_id}/comments/${comment_id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<void>;
}

export function submit_report(
  target_type: 'art' | 'comment',
  target_id: string,
  reason: string | null,
  token: string | null,
): Promise<ReportOut> {
  return request("/reports", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ target_type, target_id, reason: reason || null }),
  }) as Promise<ReportOut>;
}

export function block_user(username: string, token: string | null) {
  return request("/members/block", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ username }),
  });
}

export function unblock_user(username: string, token: string | null) {
  return request(`/members/block/${encodeURIComponent(username)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function get_blocks(token: string | null): Promise<string[]> {
  return request("/members/blocks", {
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<string[]>;
}

export function export_my_data(token: string | null): Promise<unknown> {
  return request("/members/me/export", {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function delete_account(token: string | null): Promise<{ ok: true }> {
  return request("/members/me", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<{ ok: true }>;
}

export function get_reports(token: string | null): Promise<ReportOut[]> {
  return request("/admin/reports", {
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<ReportOut[]>;
}

export function update_report_status(
  id: string,
  status: 'resolved' | 'dismissed',
  token: string | null,
): Promise<ReportOut> {
  return request(`/admin/reports/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  }) as Promise<ReportOut>;
}

// --- Contributor tooling (announcements, roles, usage, infra) ---------------

export type MemberRole = "member" | "contributor" | "admin";

export interface AdminMemberOut {
  username: string;
  firstname: string | null;
  lastname: string | null;
  role: MemberRole;
}

export function get_admin_members(token: string | null): Promise<AdminMemberOut[]> {
  return request("/admin/members", {
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<AdminMemberOut[]>;
}

export function set_member_role(
  username: string,
  role: MemberRole,
  token: string | null,
): Promise<{ username: string; role: MemberRole }> {
  return request(`/admin/members/${username}/role`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ role }),
  }) as Promise<{ username: string; role: MemberRole }>;
}

export interface AnnouncementOut {
  id: string;
  title: string;
  body: string;
  author_username: string | null;
  author_firstname: string | null;
  comment_count: number;
  created_at: string;
}

export interface AnnouncementCommentOut {
  id: string;
  username: string;
  firstname: string | null;
  text: string;
  created_at: string;
}

export interface AnnouncementDetailOut extends AnnouncementOut {
  comments: AnnouncementCommentOut[];
}

export function get_announcements(token: string | null): Promise<AnnouncementOut[]> {
  return request("/announcements", {
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<AnnouncementOut[]>;
}

export function get_announcement(id: string, token: string | null): Promise<AnnouncementDetailOut> {
  return request(`/announcements/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<AnnouncementDetailOut>;
}

export function create_announcement(title: string, body: string, token: string | null): Promise<AnnouncementOut> {
  return request("/announcements", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title, body }),
  }) as Promise<AnnouncementOut>;
}

export function delete_announcement(id: string, token: string | null): Promise<void> {
  return request(`/announcements/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<void>;
}

export function add_announcement_comment(id: string, text: string, token: string | null): Promise<AnnouncementCommentOut> {
  return request(`/announcements/${id}/comments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text }),
  }) as Promise<AnnouncementCommentOut>;
}

export function delete_announcement_comment(id: string, commentId: string, token: string | null): Promise<void> {
  return request(`/announcements/${id}/comments/${commentId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<void>;
}

export interface DayCount {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface ActiveMember {
  username: string;
  firstname: string | null;
}

export interface UsageSummary {
  days: number;
  // "Visits" = app-use sessions (a member's activity split on >30min gaps).
  total_visits: number;
  total_events: number;
  visits_per_day: DayCount[];
  active_per_day: DayCount[];
  active_today: ActiveMember[];
  top_screens: { screen: string; count: number }[];
}

export function get_usage_summary(days: number, token: string | null): Promise<UsageSummary> {
  return request(`/usage/summary?days=${days}`, {
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<UsageSummary>;
}

export interface DiskHealth {
  path: string | null;
  total: number | null;
  used: number | null;
  free: number | null;
  percent: number | null;
}

export interface InfraHealthOut {
  ok: boolean;
  // False when the host's /proc was unreadable (e.g. dev off-Linux).
  host_metrics_available: boolean;
  kernel: string | null;
  uptime_seconds: number | null;
  temperature_c: number | null;
  cpu: { percent: number | null; cores: number | null; load_1: number | null; load_5: number | null; load_15: number | null };
  memory: { total: number | null; used: number | null; available: number | null; percent: number | null };
  disk: DiskHealth;          // system / SD card
  content_disk: DiskHealth;  // the drive uploads live on
  content: { path: string | null; bytes: number | null; files: number | null; truncated: boolean };
}

export function get_infra_health(token: string | null): Promise<InfraHealthOut> {
  return request("/infra/health", {
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<InfraHealthOut>;
}
