export interface LoginPayload {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  must_setup?: boolean;
}

export interface SetupAccountIn {
  new_username: string;
  new_password: string;
}

export interface SetupCodePayload {
  code: string;
}

export interface Profile {
  id: string;
  username: string;
  firstname: string;
  lastname: string;
  city: string;
  state: string;
  bio: string;
  is_owner: boolean;
  media: string[];
  hidden_media: string[];
  role: string;
  profile_pic_path: string | null;
  terms_accepted_at: string | null;
  viewer_blocked_by_owner: boolean;
  blocked_usernames: string[] | null;
  // Component-key -> color string from the edit-profile color tab.
  // null/absent = never customized (client falls back to defaults).
  profile_colors?: Record<string, string> | null;
}

export interface ReportOut {
  id: string;
  reporter_username: string;
  target_type: 'art' | 'comment';
  target_id: string;
  target_preview: string | null;
  reason: string | null;
  status: string;
  created_at: string;
}

export interface ApplicationIn {
  firstname: string;
  lastname: string;
  email: string;
  city?: string;
  state?: string;
  known_member?: string;
  reason?: string;
}

export interface ApplicationOut {
  id: string;
  firstname: string;
  lastname: string;
  email: string;
  city: string | null;
  state: string | null;
  known_member: string | null;
  reason: string | null;
  status: string;
  created_at: string;
  temp_password?: string | null;
}

export interface Visual2DIn {
  username: string;
  medium: string;
  title: string;
  date?: string;
  location?: string;
  song?: string;
  song_artist?: string;
  height?: number | null;
  width?: number | null;
  keywords?: string;
  comments_enabled?: boolean;
  collection_id?: string | null;
  file: { uri: string; name: string; type: string };
}

export interface PromptOut {
  id: string;
  title: string;
  short_summary: string | null;
  media_id: string;
  media_name: string;
  is_active: boolean;
  submission_count: number;
}

export interface PromptDetailOut extends PromptOut {
  submissions: ArtResult[];
  viewer_submission_id: string | null;
}

export interface PromptSummary {
  id: string;
  title: string;
  media_name: string;
  is_active: boolean;
  created_at: string;
}

export interface Visual2DOut {
  id: string;
  username: string;
  medium: string;
  title: string;
  date: string;
  location: string;
  song: string;
  song_artist: string;
  height: number;
  width: number;
  keywords: string[];
  file_path: string;
  comments_enabled: boolean;
  aspect_ratio: number | null;
}

export interface Visual2DUpdatePayload {
  title: string;
  date?: string | null;
  location?: string | null;
  song?: string | null;
  song_artist?: string | null;
  width?: number | null;
  height?: number | null;
  keywords?: string[] | null;
  comments_enabled?: boolean;
  medium?: string | null;
  // When set, the on-disk file (and thumbnail) gets replaced.
  file?: { uri: string; name: string; type: string } | null;
}

export interface WrittenFormIn {
  username: string;
  medium: string;
  title: string;
  date?: string;
  keywords?: string;
  comments_enabled?: boolean;
  series_name?: string;
  // Provide exactly one of file or text.
  file?: { uri: string; name: string; type: string };
  text?: string;
}

export interface WrittenFormOut {
  id: string;
  title: string;
  date: string | null;
  keywords: string[];
  file_path: string;
  comments_enabled: boolean;
  series_id: string | null;
  series_name: string | null;
}

export interface WrittenFormUpdatePayload {
  title: string;
  date?: string | null;
  keywords?: string[] | null;
  comments_enabled?: boolean;
  medium?: string | null;
  series_name?: string | null;
  clear_series?: boolean;
  // Optional file replacement (mutually exclusive with text).
  file?: { uri: string; name: string; type: string } | null;
  text?: string | null;
}

export interface AudioIn {
  username: string;
  medium: string;
  title: string;
  date?: string;
  keywords?: string;
  comments_enabled?: boolean;
  // Performer/composer — only meaningful for uploaded music, left empty for memos.
  artist?: string;
  // Client-measured length in seconds, captured once the picked file loads.
  duration_seconds?: number | null;
  file: { uri: string; name: string; type: string };
}

export interface AudioOut {
  id: string;
  title: string;
  date: string | null;
  keywords: string[];
  file_path: string;
  comments_enabled: boolean;
  artist: string | null;
  duration_seconds: number | null;
}

export interface AudioUpdatePayload {
  title: string;
  date?: string | null;
  keywords?: string[] | null;
  comments_enabled?: boolean;
  medium?: string | null;
  artist?: string | null;
  duration_seconds?: number | null;
  // When set, the on-disk audio file gets replaced.
  file?: { uri: string; name: string; type: string } | null;
}

export interface SearchOptions {
  usernames: string[];
  fullnames: string[];
  cities: string[];
  keywords: string[];
  titles: string[];
  songs: string[];
  mediums: string[];
}

export interface ArtResult {
  id: string;
  title: string;
  medium: string;
  keywords: string[];
  song: string | null;
  file_path: string;
  date: string | null;
  location: string | null;
  creator_username: string;
  creator_city: string | null;
  aspect_ratio: number | null;
}

export interface CommentOut {
  id: string;
  username: string;
  firstname: string | null;
  text: string;
  created_at: string;
}

export interface CommentReceivedOut {
  id: string;
  text: string;
  created_at: string;
  art_id: string;
  art_title: string | null;
  art_medium: string;
  commenter_username: string;
  commenter_firstname: string | null;
}

export interface CommentsReceivedPage {
  comments: CommentReceivedOut[];
  next_cursor: string | null;
  // Snapshot of comments_last_viewed_at BEFORE the server bumped it on this
  // first-page fetch. Compare each comment.created_at against this to decide
  // seen (beige) vs unseen (gold).
  previous_view_at: string | null;
}

export interface MediaType {
  id: string;
  name: string;
  type?: string | null;
}

export interface FeatureRequestOut {
  id: string;
  username: string;
  title: string;
  up: number;
  down: number;
  my_vote: number | null; // +1 | -1 | null
  is_owner: boolean;
  created_at: string;
}

export interface FeatureRequestVoteOut {
  up: number;
  down: number;
  my_vote: number | null;
}

export interface MemberDirectoryEntry {
  username: string;
  firstname: string | null;
  lastname: string | null;
}

export interface ConversationOut {
  id: string;
  type: 'dm' | 'group';
  // Partner display name for DMs, group title for groups.
  title: string;
  partner_username: string | null;
  last_message: string | null;
  last_message_at: string | null;
  last_sender_username: string | null;
  unread: number;
}

export interface MessageOut {
  id: string;
  sender_username: string;
  sender_firstname: string | null;
  body: string;
  created_at: string;
}

export interface MessagesPage {
  messages: MessageOut[]; // newest first
  next_cursor: string | null;
  // Read cursor BEFORE this fetch bumped it (first page only) — messages newer
  // than this were unseen when the thread was opened.
  previous_read_at: string | null;
}

export interface MediaRequest {
  id: string;
  member_id: string;
  username: string;
  requested_name: string;
  status: string;
  resolved_type: string | null;
  created_at: string;
}
