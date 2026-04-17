
const API_BASE = "/api";

export function thumbUrl(artId: string, w: 256 | 512 | 1024 = 512): string {
  return `${API_BASE}/art/${artId}/thumb?w=${w}`;
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
  role: string;
  profile_pic_path: string | null;
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
}

export function update_visual_2d(id: string, token: string | null, payload: Visual2DUpdatePayload) {
  return request(`/art/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export function remove_visual_2d(id: string, token: string | null) {
  return request(`/art/${id}`, { method: 'DELETE' , headers: { Authorization: `Bearer ${token}` }});
}

export function get_members_visual_2d(username: string, medium: string): Promise<Visual2DOut[]> {
  return request(`/members/${username}/art/${medium}`) as Promise<Visual2DOut[]>;
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
