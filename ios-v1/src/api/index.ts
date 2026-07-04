export * from './types';
export { resolveImageUrl, getPortfolioUrl, thumbUrl, profileThumbUrl, profilePicSrc } from './client';

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
  WrittenFormIn,
  WrittenFormOut,
  WrittenFormUpdatePayload,
  AudioIn,
  AudioOut,
  AudioUpdatePayload,
  SearchOptions,
  ArtResult,
  CommentOut,
  CommentsReceivedPage,
  MediaType,
  MediaRequest,
  FeatureRequestOut,
  FeatureRequestVoteOut,
  ConversationOut,
  MessageOut,
  MessagesPage,
  MemberDirectoryEntry,
  ParticipantOut,
  PromptOut,
  PromptDetailOut,
  PromptSummary,
} from './types';

export function login_user(payload: LoginPayload): Promise<LoginResponse> {
  return request('/members/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<LoginResponse>;
}

export function forgot_password(email: string): Promise<{ ok: boolean }> {
  return request('/members/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  }) as Promise<{ ok: boolean }>;
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
  if (payload.collection_id) fd.append('collection_id', payload.collection_id);
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
  const fd = new FormData();
  fd.append('title', payload.title);
  if (payload.date) fd.append('date', payload.date);
  if (payload.location != null) fd.append('location', payload.location);
  if (payload.song != null) fd.append('song', payload.song);
  if (payload.song_artist != null) fd.append('song_artist', payload.song_artist);
  if (payload.width != null) fd.append('width', String(payload.width));
  if (payload.height != null) fd.append('height', String(payload.height));
  if (payload.keywords != null) fd.append('keywords', payload.keywords.join(', '));
  if (payload.comments_enabled != null) fd.append('comments_enabled', String(payload.comments_enabled));
  if (payload.medium) fd.append('medium', payload.medium);
  if (payload.file) {
    fd.append('file', {
      uri: payload.file.uri,
      name: payload.file.name,
      type: payload.file.type,
    } as any);
  }
  return request(`/art/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
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

export function add_new_written_form(token: string | null, payload: WrittenFormIn) {
  const fd = new FormData();
  fd.append('username', payload.username);
  fd.append('medium', payload.medium);
  fd.append('title', payload.title);
  if (payload.date) fd.append('date', payload.date);
  if (payload.keywords != null) fd.append('keywords', String(payload.keywords));
  if (payload.comments_enabled != null) fd.append('comments_enabled', String(payload.comments_enabled));
  if (payload.series_name) fd.append('series_name', payload.series_name);
  if (payload.file) {
    fd.append('file', {
      uri: payload.file.uri,
      name: payload.file.name,
      type: payload.file.type,
    } as any);
  }
  if (payload.text) fd.append('text', payload.text);

  return request('/art/upload/written-form', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
}

export function get_members_written_form(username: string, medium: string): Promise<WrittenFormOut[]> {
  return request(`/members/${username}/art/written-form/${medium}`) as Promise<WrittenFormOut[]>;
}

export function update_written_form(id: string, token: string | null, payload: WrittenFormUpdatePayload) {
  // PATCH is now multipart so the user can swap the underlying file or paste
  // new text inline. Keep sending fields as form-data even when no file/text
  // changes so the endpoint contract stays a single shape.
  const fd = new FormData();
  fd.append('title', payload.title);
  if (payload.date) fd.append('date', payload.date);
  if (payload.keywords != null) fd.append('keywords', payload.keywords.join(', '));
  if (payload.comments_enabled != null) fd.append('comments_enabled', String(payload.comments_enabled));
  if (payload.medium) fd.append('medium', payload.medium);
  if (payload.series_name != null) fd.append('series_name', payload.series_name);
  if (payload.clear_series) fd.append('clear_series', String(payload.clear_series));
  if (payload.file) {
    fd.append('file', {
      uri: payload.file.uri,
      name: payload.file.name,
      type: payload.file.type,
    } as any);
  }
  if (payload.text) fd.append('text', payload.text);

  return request(`/art/written-form/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
}

export function remove_written_form(id: string, token: string | null) {
  return request(`/art/written-form/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function add_new_audio(token: string | null, payload: AudioIn) {
  const fd = new FormData();
  fd.append('username', payload.username);
  fd.append('medium', payload.medium);
  fd.append('title', payload.title);
  if (payload.date) fd.append('date', payload.date);
  if (payload.keywords != null) fd.append('keywords', String(payload.keywords));
  if (payload.comments_enabled != null) fd.append('comments_enabled', String(payload.comments_enabled));
  if (payload.artist) fd.append('artist', payload.artist);
  if (payload.duration_seconds != null) fd.append('duration_seconds', String(payload.duration_seconds));
  fd.append('file', {
    uri: payload.file.uri,
    name: payload.file.name,
    type: payload.file.type,
  } as any);

  return request('/art/upload/audio', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
}

export function get_members_audio(username: string, medium: string): Promise<AudioOut[]> {
  return request(`/members/${username}/art/audio/${medium}`) as Promise<AudioOut[]>;
}

export function update_audio(id: string, token: string | null, payload: AudioUpdatePayload) {
  const fd = new FormData();
  fd.append('title', payload.title);
  if (payload.date) fd.append('date', payload.date);
  if (payload.keywords != null) fd.append('keywords', payload.keywords.join(', '));
  if (payload.comments_enabled != null) fd.append('comments_enabled', String(payload.comments_enabled));
  if (payload.medium) fd.append('medium', payload.medium);
  if (payload.artist != null) fd.append('artist', payload.artist);
  if (payload.duration_seconds != null) fd.append('duration_seconds', String(payload.duration_seconds));
  if (payload.file) {
    fd.append('file', {
      uri: payload.file.uri,
      name: payload.file.name,
      type: payload.file.type,
    } as any);
  }
  return request(`/art/audio/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
}

export function remove_audio(id: string, token: string | null) {
  return request(`/art/audio/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function get_comments(art_id: string, token: string | null): Promise<CommentOut[]> {
  return request(`/art/${art_id}/comments`, {
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<CommentOut[]>;
}

export function get_comments_received(
  token: string | null,
  cursor: string | null,
  limit = 20,
): Promise<CommentsReceivedPage> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  params.set('limit', String(limit));
  return request(`/members/me/comments-received?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<CommentsReceivedPage>;
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

export function get_feature_requests(token: string | null): Promise<FeatureRequestOut[]> {
  return request('/feature-requests', {
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<FeatureRequestOut[]>;
}

export function create_feature_request(title: string, token: string | null): Promise<FeatureRequestOut> {
  return request('/feature-requests', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title }),
  }) as Promise<FeatureRequestOut>;
}

export function vote_feature_request(
  request_id: string,
  value: 1 | -1,
  token: string | null,
): Promise<FeatureRequestVoteOut> {
  return request(`/feature-requests/${request_id}/vote`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ value }),
  }) as Promise<FeatureRequestVoteOut>;
}

export function delete_feature_request(request_id: string, token: string | null) {
  return request(`/feature-requests/${request_id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function get_member_directory(token: string | null): Promise<MemberDirectoryEntry[]> {
  return request('/members/directory', {
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<MemberDirectoryEntry[]>;
}

export function get_unread_count(token: string | null): Promise<{ unread: number }> {
  return request('/conversations/unread-count', {
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<{ unread: number }>;
}

export function get_conversations(token: string | null): Promise<ConversationOut[]> {
  return request('/conversations', {
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<ConversationOut[]>;
}

export function open_dm(username: string, token: string | null): Promise<ConversationOut> {
  return request('/conversations/dm', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ username }),
  }) as Promise<ConversationOut>;
}

export function create_group(
  title: string,
  usernames: string[],
  token: string | null,
): Promise<ConversationOut> {
  return request('/conversations/group', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ title, usernames }),
  }) as Promise<ConversationOut>;
}

export function get_messages(
  conversation_id: string,
  token: string | null,
  cursor: string | null = null,
  limit = 30,
): Promise<MessagesPage> {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  params.set('limit', String(limit));
  return request(`/conversations/${conversation_id}/messages?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<MessagesPage>;
}

export function send_message(
  conversation_id: string,
  body: string,
  token: string | null,
): Promise<MessageOut> {
  return request(`/conversations/${conversation_id}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ body }),
  }) as Promise<MessageOut>;
}

export function get_participants(
  conversation_id: string,
  token: string | null,
): Promise<ParticipantOut[]> {
  return request(`/conversations/${conversation_id}/participants`, {
    headers: { Authorization: `Bearer ${token}` },
  }) as Promise<ParticipantOut[]>;
}

export function add_group_members(
  conversation_id: string,
  usernames: string[],
  token: string | null,
): Promise<{ ok: boolean; added: number }> {
  return request(`/conversations/${conversation_id}/participants`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ usernames }),
  }) as Promise<{ ok: boolean; added: number }>;
}

export function leave_group(conversation_id: string, token: string | null) {
  return request(`/conversations/${conversation_id}/leave`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function get_active_prompt(token: string | null): Promise<PromptOut | null> {
  return request("/prompts/active", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }) as Promise<PromptOut | null>;
}

export function get_prompt(id: string, token: string | null): Promise<PromptDetailOut> {
  return request(`/prompts/${id}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }) as Promise<PromptDetailOut>;
}

export function list_prompts(token: string | null): Promise<PromptSummary[]> {
  return request("/prompts", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }) as Promise<PromptSummary[]>;
}

