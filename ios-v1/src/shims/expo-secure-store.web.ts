// Web-only stand-in for expo-secure-store, aliased in metro.config.js when
// bundling for the browser (expo web has no SecureStore implementation, so
// setItemAsync throws and login dies right after the server says yes).
// localStorage is fine for the dev-preview use case; native builds never see this.

export async function getItemAsync(key: string): Promise<string | null> {
  return localStorage.getItem(key);
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  localStorage.setItem(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  localStorage.removeItem(key);
}
