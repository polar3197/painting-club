export * from './types';
export { resolveImageUrl, getPortfolioUrl, thumbUrl, profileThumbUrl } from './client';

import { request } from './client';
import type {
  LoginPayload,
  LoginResponse,
  Profile,
  ApplicationIn,
  ApplicationOut,
  SetupAccountIn,
  SetupCodePayload,
  Visual2DIn,
  Visual2DOut,
  Visual2DUpdatePayload,
  SearchOptions,
  ArtResult,
  CommentOut,
  MediaType,
  MediaRequest,
} from './types';

export function login_user(payload: LoginPayload): Promise<LoginResponse> {
  return request('/members/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<LoginResponse>;
}

export function redeem_setup_code(payload: SetupCodePayload): Promise<LoginResponse> {
  return request('/members/redeem-setup-code', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<LoginResponse>;
}

export function get_profile(username: string, token: string | null): Promise<Profile> {
  return request(`/members/${username}/profile`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }) as Promise<Profile>;
}

export function setup_account(payload: SetupAccountIn, token: string): Promise<{ id: string; username: string }> {
  return request('/members/setup-account', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  }) as Promise<{ id: string; username: string }>;
}

export function get_profiles(): Promise<Profile[]> {
  return request('/members/all/profile') as Promise<Profile[]>;
}

export function accept_terms(token: string): Promise<{ terms_accepted_at: string }> {
  return request('/members/accept-terms', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<{ terms_accepted_at: string }>;
}

export function export_my_data(token: string): Promise<unknown> {
  return request('/members/me/export', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function delete_account(token: string): Promise<{ ok: true }> {
  return request('/members/me', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<{ ok: true }>;
}

export function submit_report(
  target_type: 'art' | 'comment',
  target_id: string,
  reason: string | null,
  token: string | null,
) {
  return request('/reports', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ target_type, target_id, reason: reason || null }),
  });
}

export function block_user(username: string, token: string | null) {
  return request('/members/block', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ username }),
  });
}

export function unblock_user(username: string, token: string | null) {
  return request(`/members/block/${encodeURIComponent(username)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function get_blocks(token: string | null): Promise<string[]> {
  return request('/members/blocks', {
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<string[]>;
}

import type { ReportOut } from './types';

export function get_reports(token: string | null): Promise<ReportOut[]> {
  return request('/admin/reports', {
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<ReportOut[]>;
}

export function update_report_status(id: string, status: 'resolved' | 'dismissed', token: string | null) {
  return request(`/admin/reports/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  });
}

export function upload_profile_picture(
  file: { uri: string; name: string; type: string },
  token: string | null,
): Promise<{ profile_pic_path: string }> {
  const fd = new FormData();
  fd.append('file', { uri: file.uri, name: file.name, type: file.type } as any);
  return request('/members/profile-picture', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  }) as Promise<{ profile_pic_path: string }>;
}

export function update_username(new_username: string, token: string | null): Promise<{ username: string }> {
  return request('/members/update-username', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ username: new_username }),
  }) as Promise<{ username: string }>;
}

export function update_profile(username: string, payload: Profile, token: string | null) {
  return request(`/members/${username}/update-profile`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export function get_media(): Promise<MediaType[]> {
  return request('/media') as Promise<MediaType[]>;
}

export function add_member_media(username: string, medium: string, token: string | null) {
  return request('/members/addmedia', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ username, medium }),
  });
}

export function set_media_visibility(medium: string, hidden: boolean, token: string | null) {
  return request(`/members/media/${encodeURIComponent(medium)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ hidden }),
  });
}

export function submit_media_request(name: string, token: string | null): Promise<MediaRequest> {
  return request('/media-requests', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name }),
  }) as Promise<MediaRequest>;
}

export function get_media_requests(token: string | null): Promise<MediaRequest[]> {
  return request('/admin/media-requests', {
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<MediaRequest[]>;
}

export function update_media_request(
  id: string,
  status: 'approved' | 'rejected',
  type: string | null,
  token: string | null,
  name: string | null = null,
): Promise<MediaRequest> {
  return request(`/admin/media-requests/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status, type, name }),
  }) as Promise<MediaRequest>;
}

export function get_members(city: string, uname: string, token: string | null): Promise<Profile[]> {
  const qs = `city=${encodeURIComponent(city)}&uname=${encodeURIComponent(uname)}`;
  return request(`/members?${qs}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }) as Promise<Profile[]>;
}

export function get_search_options(medium?: string, username?: string): Promise<SearchOptions> {
  const parts: string[] = [];
  if (medium) parts.push(`medium=${encodeURIComponent(medium)}`);
  if (username) parts.push(`username=${encodeURIComponent(username)}`);
  const qs = parts.length > 0 ? `?${parts.join('&')}` : '';
  return request(`/members/search-options${qs}`) as Promise<SearchOptions>;
}

export function search_art(q: string): Promise<ArtResult[]> {
  return request(`/art/search?q=${encodeURIComponent(q)}`) as Promise<ArtResult[]>;
}

export function add_new_visual_2d(token: string | null, payload: Visual2DIn) {
  const fd = new FormData();
  fd.append('username', payload.username);
  fd.append('medium', payload.medium);
  fd.append('title', payload.title);
  if (payload.date) fd.append('date', payload.date);
  if (payload.location) fd.append('location', payload.location);
  if (payload.song) fd.append('song', payload.song);
  if (payload.song_artist) fd.append('song_artist', payload.song_artist);
  if (payload.width != null) fd.append('width', String(payload.width));
  if (payload.height != null) fd.append('height', String(payload.height));
  if (payload.keywords != null) fd.append('keywords', String(payload.keywords));
  if (payload.comments_enabled != null) fd.append('comments_enabled', String(payload.comments_enabled));
  fd.append('file', {
    uri: payload.file.uri,
    name: payload.file.name,
    type: payload.file.type,
  } as any);

  return request('/art/upload/visual-2d', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
}

export function update_visual_2d(id: string, token: string | null, payload: Visual2DUpdatePayload) {
  return request(`/art/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export function remove_visual_2d(id: string, token: string | null) {
  return request(`/art/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function get_members_visual_2d(username: string, medium: string): Promise<Visual2DOut[]> {
  return request(`/members/${username}/art/${medium}`) as Promise<Visual2DOut[]>;
}

export function get_comments(art_id: string, token: string | null): Promise<CommentOut[]> {
  return request(`/art/${art_id}/comments`, {
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<CommentOut[]>;
}

export function post_comment(art_id: string, text: string, token: string | null): Promise<CommentOut> {
  return request(`/art/${art_id}/comments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ text }),
  }) as Promise<CommentOut>;
}

export function delete_comment(art_id: string, comment_id: string, token: string | null): Promise<void> {
  return request(`/art/${art_id}/comments/${comment_id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<void>;
}

export function submit_application(payload: ApplicationIn): Promise<unknown> {
  return request('/apply', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function get_applications(token: string | null): Promise<ApplicationOut[]> {
  return request('/admin/applications', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }) as Promise<ApplicationOut[]>;
}

export function update_application_status(id: string, status: string, token: string | null): Promise<unknown> {
  return request(`/admin/applications/${id}`, {
    method: 'PATCH',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify({ status }),
  });
}

export function delete_application(id: string, token: string | null): Promise<unknown> {
  return request(`/admin/applications/${id}`, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}
