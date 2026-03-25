
const API_BASE = "/api";

interface RequestOptions extends RequestInit {
  headers?: Record<string, string>;
}

async function request(path: string, options: RequestOptions = {}): Promise<unknown> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    const detail = (data as { detail?: string })?.detail || `Request failed with status ${response.status}`;
    throw new Error(detail);
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
  bio:string;
  is_owner: boolean;
  media: string[];
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

export function get_members(city: string, uname: string, token: string | null): Promise<Profile[]> {
  const params = new URLSearchParams({ city, uname });
  const members = request(`/members?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<Profile[]>;
  return members;
}

export function get_search_options(token: string | null): Promise<[string[], string[]]> {
    return request("/members/search-options", {                                                                                               
      headers: { Authorization: `Bearer ${token}` },
    }) as Promise<[string[], string[]]>;                                                                                                      
  } 
