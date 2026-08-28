import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { get_applications, get_media_requests } from "../api";

export interface AdminPending {
  applications: number; // account requests awaiting review
  media: number;        // media-type requests awaiting review
  total: number;
}

const EMPTY: AdminPending = { applications: 0, media: 0, total: 0 };
const POLL_MS = 30000;

// Counts of pending account + media requests, for the settings-gear dot.
// Polls while mounted; zeros for anyone who can't see the admin panel.
// (Same shape as the iOS hook; contributors count too since they pass every
// admin gate and see the same links.)
export function useAdminPending(): AdminPending {
  const { token, currentRole } = useAuth()!;
  const [pending, setPending] = useState<AdminPending>(EMPTY);

  useEffect(() => {
    const canSee = currentRole === "admin" || currentRole === "contributor";
    if (!canSee || !token) return;
    let live = true;
    const check = async () => {
      const [apps, media] = await Promise.all([
        get_applications(token).catch(() => []),
        get_media_requests(token).catch(() => []),
      ]);
      if (!live) return;
      const applications = apps.filter((a) => a.status === "pending").length;
      const mediaCount = media.filter((m) => m.status === "pending").length;
      setPending({ applications, media: mediaCount, total: applications + mediaCount });
    };
    check();
    const iv = setInterval(check, POLL_MS);
    return () => { live = false; clearInterval(iv); };
  }, [currentRole, token]);

  return pending;
}
