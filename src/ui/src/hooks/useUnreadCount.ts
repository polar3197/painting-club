import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { get_unread_count } from "../api";

const POLL_MS = 30000;

// Unread message count for the profile mail button's dot. Polls while mounted.
export function useUnreadCount(): number {
  const { token } = useAuth()!;
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!token) return;
    let live = true;
    const check = () => get_unread_count(token).then((r) => { if (live) setUnread(r.unread); }).catch(() => {});
    check();
    const iv = setInterval(check, POLL_MS);
    return () => { live = false; clearInterval(iv); };
  }, [token]);
  return unread;
}
