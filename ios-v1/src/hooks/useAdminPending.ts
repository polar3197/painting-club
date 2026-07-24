import { useEffect, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { get_applications, get_media_requests, get_admin_prompt_queue } from '../api';

export interface AdminPending {
  applications: number; // account requests awaiting review
  media: number;        // media-type requests awaiting review
  prompts: number;      // proposed weekly-prompt suggestions awaiting review
  total: number;
}

const EMPTY: AdminPending = { applications: 0, media: 0, prompts: 0, total: 0 };
const POLL_MS = 30000;

// Admin/contributor: counts of pending account (application), media, and
// weekly-prompt requests. Polls while the calling screen is focused; returns
// all zeros for plain members. Used for the settings-gear red dot, the
// per-row dots in Settings, and the Home alert.
export function useAdminPending(): AdminPending {
  const { token, currentRole } = useAuth();
  const isFocused = useIsFocused();
  const [pending, setPending] = useState<AdminPending>(EMPTY);

  useEffect(() => {
    if (!isFocused || !token || (currentRole !== 'admin' && currentRole !== 'contributor')) {
      setPending(EMPTY);
      return;
    }
    let live = true;
    const check = async () => {
      const [apps, media, queue] = await Promise.all([
        get_applications(token).catch(() => []),
        get_media_requests(token).catch(() => []),
        get_admin_prompt_queue(token).catch(() => ({ proposed: [], up_next: [] })),
      ]);
      if (!live) return;
      const applications = apps.filter((a) => a.status === 'pending').length;
      const mediaCount = media.filter((m) => m.status === 'pending').length;
      const prompts = queue.proposed.length;
      setPending({
        applications,
        media: mediaCount,
        prompts,
        total: applications + mediaCount + prompts,
      });
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
