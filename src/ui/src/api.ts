
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
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
        ...(!isFormData && { "Content-Type": "application/json" }),
        ...(options.headers || {}),
    },
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await response.json() : null;

  // Expired/invalid token on an authenticated request → clear session + kick to landing.
  // Skip the redirect for login/redeem so bad-password or bad-code attempts don't bounce the page.
  if (
    response.status === 401 &&
    !path.startsWith("/members/login") &&
    !path.startsWith("/members/redeem-setup-code")
  ) {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("role");
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
  // Series name ("series" of paintings — same grouping as albums/collections).
  series_name?: string;
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
  series_id: string | null;
  series_name: string | null;
  order_index: number | null;
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

// The three medium categories a piece can belong to. The requester picks one
// when proposing a new media form so the admin no longer has to classify it.
export type MediaTypeKind = "visual_2d" | "written_form" | "audio";

export interface MediaRequest {
  id: string;
  member_id: string;
  username: string;
  requested_name: string;
  status: string;
  // What the requester picked at submission. Null on rows created before
  // requesters chose their own type.
  requested_type: string | null;
  resolved_type: string | null;
  created_at: string;
}

export function submit_media_request(
  name: string,
  type: MediaTypeKind,
  token: string | null,
): Promise<MediaRequest> {
  return request(`/media-requests`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, type }),
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
  if (payload.series_name) fd.append("series_name", payload.series_name);
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
  series_name?: string | null;
  clear_series?: boolean;
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
  if (payload.series_name) fd.append("series_name", payload.series_name);
  if (payload.clear_series) fd.append("clear_series", String(payload.clear_series));
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

// ---------------------------------------------------------------------------
// Session / account extras (ported from the iOS client)
// ---------------------------------------------------------------------------

// Sliding session: swap a still-valid token for a fresh 30-day one on app load.
export function refresh_token(token: string): Promise<LoginResponse> {
  return request("/members/refresh-token", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<LoginResponse>;
}

// Always answers {ok: true}; the reset code lands in the admin panel's
// "password resets" section for manual delivery, redeemed via "secret code?".
export function forgot_password(username: string): Promise<{ ok: boolean }> {
  return request("/members/forgot-password", {
    method: "POST",
    body: JSON.stringify({ username }),
  }) as Promise<{ ok: boolean }>;
}

export function accept_terms(token: string): Promise<{ terms_accepted_at: string }> {
  return request("/members/accept-terms", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<{ terms_accepted_at: string }>;
}

export interface PasswordResetOut {
  username: string;
  email: string | null;
  firstname: string | null;
  lastname: string | null;
  code: string;
  expires_at: string | null;
}

export function get_password_resets(token: string | null): Promise<PasswordResetOut[]> {
  return request("/admin/password-resets", {
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<PasswordResetOut[]>;
}

// ---------------------------------------------------------------------------
// Audio (music + voice memos)
// ---------------------------------------------------------------------------

export interface AudioIn {
  username: string;
  medium: string;
  title: string;
  date?: string;
  keywords?: string;
  comments_enabled?: boolean;
  // Performer/composer — only meaningful for uploaded music.
  artist?: string;
  // Client-measured length in seconds, captured once the picked file loads.
  duration_seconds?: number | null;
  // Album name — the audio flavour of a series (created server-side on demand).
  series_name?: string;
  file: File;
}

export interface AudioOut {
  id: string;
  title: string;
  date: string | null;
  keywords: string[];
  file_path: string;
  comments_enabled: boolean;
  artist: string | null;
  duration_seconds: number | null;
  // Album membership (an album is a series of audio pieces).
  series_id: string | null;
  series_name: string | null;
  order_index: number | null;
}

export interface AudioUpdatePayload {
  title: string;
  date?: string | null;
  keywords?: string[] | null;
  comments_enabled?: boolean;
  medium?: string | null;
  artist?: string | null;
  duration_seconds?: number | null;
  series_name?: string | null;
  clear_series?: boolean;
  // When set, the on-disk audio file gets replaced.
  file?: File | null;
}

export function add_new_audio(token: string | null, payload: AudioIn) {
  const fd = new FormData();
  fd.append("username", payload.username);
  fd.append("medium", payload.medium);
  fd.append("title", payload.title);
  if (payload.date) fd.append("date", payload.date);
  if (payload.keywords != null) fd.append("keywords", String(payload.keywords));
  if (payload.comments_enabled != null) fd.append("comments_enabled", String(payload.comments_enabled));
  if (payload.artist) fd.append("artist", payload.artist);
  if (payload.duration_seconds != null) fd.append("duration_seconds", String(payload.duration_seconds));
  if (payload.series_name) fd.append("series_name", payload.series_name);
  fd.append("file", payload.file);

  return request("/art/upload/audio", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
}

export function get_members_audio(username: string, medium: string): Promise<AudioOut[]> {
  return request(`/members/${username}/art/audio/${medium}`) as Promise<AudioOut[]>;
}

export function update_audio(id: string, token: string | null, payload: AudioUpdatePayload) {
  const fd = new FormData();
  fd.append("title", payload.title);
  if (payload.date) fd.append("date", payload.date);
  if (payload.keywords != null) fd.append("keywords", payload.keywords.join(", "));
  if (payload.comments_enabled != null) fd.append("comments_enabled", String(payload.comments_enabled));
  if (payload.medium) fd.append("medium", payload.medium);
  if (payload.artist != null) fd.append("artist", payload.artist);
  if (payload.duration_seconds != null) fd.append("duration_seconds", String(payload.duration_seconds));
  if (payload.series_name) fd.append("series_name", payload.series_name);
  if (payload.clear_series) fd.append("clear_series", String(payload.clear_series));
  if (payload.file) fd.append("file", payload.file);
  return request(`/art/audio/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
}

export function remove_audio(id: string, token: string | null) {
  return request(`/art/audio/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ---------------------------------------------------------------------------
// Comments received (on your own art)
// ---------------------------------------------------------------------------

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
  // Snapshot of comments_last_viewed_at BEFORE the server bumped it on this
  // first-page fetch. Compare each comment.created_at against this to decide
  // seen vs unseen (gold).
  previous_view_at: string | null;
}

export function get_comments_received(
  token: string | null,
  cursor: string | null,
  limit = 20,
): Promise<CommentsReceivedPage> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  params.set("limit", String(limit));
  return request(`/members/me/comments-received?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<CommentsReceivedPage>;
}

// ---------------------------------------------------------------------------
// Feature requests
// ---------------------------------------------------------------------------

export interface FeatureRequestOut {
  id: string;
  // Requester — only present when the viewer is an admin.
  username: string | null;
  title: string;
  up: number;
  down: number;
  my_vote: number | null; // +1 | -1 | null
  is_owner: boolean;
  created_at: string;
}

export interface FeatureRequestVoteOut {
  up: number;
  down: number;
  my_vote: number | null;
}

export function get_feature_requests(token: string | null): Promise<FeatureRequestOut[]> {
  return request("/feature-requests", {
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<FeatureRequestOut[]>;
}

export function create_feature_request(title: string, token: string | null): Promise<FeatureRequestOut> {
  return request("/feature-requests", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title }),
  }) as Promise<FeatureRequestOut>;
}

export function vote_feature_request(
  request_id: string,
  value: 1 | -1,
  token: string | null,
): Promise<FeatureRequestVoteOut> {
  return request(`/feature-requests/${request_id}/vote`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ value }),
  }) as Promise<FeatureRequestVoteOut>;
}

export function delete_feature_request(request_id: string, token: string | null) {
  return request(`/feature-requests/${request_id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ---------------------------------------------------------------------------
// Messaging (DMs + groups)
// ---------------------------------------------------------------------------

export interface MemberDirectoryEntry {
  username: string;
  firstname: string | null;
  lastname: string | null;
}

export interface ParticipantOut {
  username: string;
  firstname: string | null;
  lastname: string | null;
  role: string;
}

export interface ConversationOut {
  id: string;
  type: 'dm' | 'group';
  // Partner display name for DMs, group title for groups.
  title: string;
  partner_username: string | null;
  last_message: string | null;
  last_message_at: string | null;
  last_sender_username: string | null;
  unread: number;
}

export interface MessageOut {
  id: string;
  sender_username: string;
  sender_firstname: string | null;
  body: string;
  created_at: string;
}

export interface MessagesPage {
  messages: MessageOut[]; // newest first
  next_cursor: string | null;
  // Read cursor BEFORE this fetch bumped it (first page only) — messages newer
  // than this were unseen when the thread was opened.
  previous_read_at: string | null;
}

// All members except the viewer, with blocked pairs excluded server-side.
export function get_member_directory(token: string | null): Promise<MemberDirectoryEntry[]> {
  return request("/members/directory", {
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<MemberDirectoryEntry[]>;
}

export function get_unread_count(token: string | null): Promise<{ unread: number }> {
  return request("/conversations/unread-count", {
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<{ unread: number }>;
}

export function get_conversations(token: string | null): Promise<ConversationOut[]> {
  return request("/conversations", {
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<ConversationOut[]>;
}

// Idempotent: returns the existing DM with that member if one exists.
export function open_dm(username: string, token: string | null): Promise<ConversationOut> {
  return request("/conversations/dm", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ username }),
  }) as Promise<ConversationOut>;
}

export function create_group(
  title: string,
  usernames: string[],
  token: string | null,
): Promise<ConversationOut> {
  return request("/conversations/group", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title, usernames }),
  }) as Promise<ConversationOut>;
}

// First page (no cursor) bumps the viewer's read cursor server-side.
export function get_messages(
  conversation_id: string,
  token: string | null,
  cursor: string | null = null,
  limit = 30,
): Promise<MessagesPage> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  params.set("limit", String(limit));
  return request(`/conversations/${conversation_id}/messages?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<MessagesPage>;
}

export function send_message(
  conversation_id: string,
  body: string,
  token: string | null,
): Promise<MessageOut> {
  return request(`/conversations/${conversation_id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ body }),
  }) as Promise<MessageOut>;
}

export function get_participants(
  conversation_id: string,
  token: string | null,
): Promise<ParticipantOut[]> {
  return request(`/conversations/${conversation_id}/participants`, {
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<ParticipantOut[]>;
}

export function add_group_members(
  conversation_id: string,
  usernames: string[],
  token: string | null,
): Promise<{ ok: boolean; added: number }> {
  return request(`/conversations/${conversation_id}/participants`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ usernames }),
  }) as Promise<{ ok: boolean; added: number }>;
}

// Leaving as the last participant deletes the conversation server-side.
export function leave_group(conversation_id: string, token: string | null) {
  return request(`/conversations/${conversation_id}/leave`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}
