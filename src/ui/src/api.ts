
const API_BASE = "/api";

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
}

export interface Profile {
  username: string;
  firstname: string;
  lastname: string;
  city: string;
  state: string;
  bio:string;
  is_owner: boolean;
  media: string[];
}

export interface Visual2D {
  username: string;
  medium: string;
  title: string;
  date?: string;
  location?: string;
  song?: string;
  height?: number | null;
  width?: number | null;
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
  height: number;
  width: number;
  file_path: string;
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
  return request("/members/login", {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<LoginResponse>;
}

export function get_profile(username: string, token: string | null): Promise<Profile> {
  return request(`/members/${username}/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<Profile>;
}

export function get_profiles(): Promise<Profile[]> {
  return request(`/members/all/profile`) as Promise<Profile[]>;
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
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<Profile[]>;
  return members;
}

export function get_search_options(): Promise<[string[], string[]]> {
  return request("/members/search-options") as Promise<[string[], string[]]>;                                                                                                      
} 

export function add_new_visual_2d(token: string | null, payload: Visual2D) {
  const fd = new FormData();
  fd.append("username", payload.username);
  fd.append("medium", payload.medium);
  fd.append("title", payload.title);
  if (payload.date) fd.append("date", payload.date);
  if (payload.location) fd.append("location", payload.location);
  if (payload.song) fd.append("song", payload.song);
  if (payload.width != null) fd.append("width", String(payload.width));
  if (payload.height != null) fd.append("height", String(payload.height));
  fd.append("file", payload.file);

  return request("/art/upload/visual-2d", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
}

export function get_members_visual_2d(username: string, medium: string): Promise<Visual2DOut[]> {
  return request(`/members/${username}/art/${medium}`) as Promise<Visual2DOut[]>;
}
