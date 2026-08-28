// The single owner of how the session is persisted. api.ts (which can't use
// hooks) and AuthContext both go through here; components never touch storage
// directly — they read `token` / `currentUser` from useAuth().
const KEYS = { token: "token", username: "username", role: "role" } as const;

export interface Session {
  token: string;
  username: string;
  role: string;
}

export function readSession(): { [K in keyof Session]: string | null } {
  return {
    token: localStorage.getItem(KEYS.token),
    username: localStorage.getItem(KEYS.username),
    role: localStorage.getItem(KEYS.role),
  };
}

export function getToken(): string | null {
  return localStorage.getItem(KEYS.token);
}

export function writeSession({ token, username, role }: Session): void {
  localStorage.setItem(KEYS.token, token);
  localStorage.setItem(KEYS.username, username);
  localStorage.setItem(KEYS.role, role);
}

export function clearSession(): void {
  for (const key of Object.values(KEYS)) localStorage.removeItem(key);
}
