import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { FeatureRequestOut, get_feature_requests, create_feature_request, vote_feature_request, delete_feature_request } from "../api";
import { swr } from "../cache";

// Optimistic vote math mirroring the server: same direction retracts,
// opposite direction switches.
export function applyVote(r: FeatureRequestOut, value: 1 | -1): FeatureRequestOut {
  const next = { ...r };
  if (r.my_vote === value) {
    next.my_vote = null;
    if (value === 1) next.up -= 1; else next.down -= 1;
  } else {
    if (r.my_vote === 1) next.up -= 1;
    if (r.my_vote === -1) next.down -= 1;
    next.my_vote = value;
    if (value === 1) next.up += 1; else next.down += 1;
  }
  return next;
}

export function useFeatureRequests() {
  const { token, currentRole } = useAuth()!;
  const [requests, setRequests] = useState<FeatureRequestOut[] | null>(null);

  const load = useCallback(
    () => swr("feature-requests", () => get_feature_requests(token), setRequests).catch(() => setRequests((r) => r ?? [])),
    [token],
  );
  useEffect(() => { load(); }, [load]);

  const vote = (id: string, value: 1 | -1) => {
    setRequests((prev) => (prev ?? []).map((r) => (r.id === id ? applyVote(r, value) : r)));
    vote_feature_request(id, value, token)
      .then((tally) => setRequests((prev) => (prev ?? []).map((r) => (r.id === id ? { ...r, ...tally } : r))))
      .catch(load); // out of sync — refetch the truth
  };

  const add = async (title: string) => {
    const created = await create_feature_request(title, token);
    setRequests((prev) => [created, ...(prev ?? [])]);
  };

  const remove = async (r: FeatureRequestOut) => {
    setRequests((prev) => (prev ?? []).filter((x) => x.id !== r.id));
    try { await delete_feature_request(r.id, token); } catch { load(); }
  };

  const canDelete = (r: FeatureRequestOut) => r.is_owner || currentRole === "admin" || currentRole === "contributor";

  return { requests, vote, add, remove, canDelete, load };
}
