import { useEffect, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { get_applications, get_media_requests } from '../api';

export interface AdminPending {
  applications: number; // account requests awaiting review
  media: number;        // media-type requests awaiting review
  total: number;
}

const EMPTY: AdminPending = { applications: 0, media: 0, total: 0 };
const POLL_MS = 30000;

// Admin-only: counts of pending account (application) + media requests. Polls
// while the calling screen is focused; returns all zeros for non-admins. Used
// for the settings-gear red dot and the Home alert.
export function useAdminPending(): AdminPending {
  const { token, currentRole } = useAuth();
  const isFocused = useIsFocused();
  const [pending, setPending] = useState<AdminPending>(EMPTY);

  useEffect(() => {
    if (!isFocused || currentRole !== 'admin' || !token) {
      setPending(EMPTY);
      return;
    }
    let live = true;
    const check = async () => {
      const [apps, media] = await Promise.all([
        get_applications(token).catch(() => []),
        get_media_requests(token).catch(() => []),
      ]);
      if (!live) return;
      const applications = apps.filter((a) => a.status === 'pending').length;
      const mediaCount = media.filter((m) => m.status === 'pending').length;
      setPending({ applications, media: mediaCount, total: applications + mediaCount });
    };
    check();
    const iv = setInterval(check, POLL_MS);
    return () => {
      live = false;
      clearInterval(iv);
    };
  }, [isFocused, currentRole, token]);

  return pending;
}
