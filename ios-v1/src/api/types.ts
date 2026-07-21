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

export interface PasswordResetOut {
  username: string;
  email: string | null;
  firstname: string | null;
  lastname: string | null;
  code: string;
  expires_at: string | null;
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
  // Series name ("series" of paintings — same grouping as albums/collections).
  series_name?: string;
  file: { uri: string; name: string; type: string };
}

export interface PromptOut {
  id: string;
  title: string;
  short_summary: string | null;
  // Null when the prompt is medium-agnostic (promoted from an agnostic suggestion).
  media_id: string | null;
  media_name: string | null;
  is_active: boolean;
  submission_count: number;
  // When the prompt went live (naive UTC — parse with parseUtc). Null for a
  // prompt that has never been activated, and absent entirely against a backend
  // older than the activated_at change, so treat it as optional.
  activated_at?: string | null;
}

export interface PromptDetailOut extends PromptOut {
  submissions: ArtResult[];
  viewer_submission_id: string | null;
}

export interface PromptSummary {
  id: string;
  title: string;
  media_name: string | null; // null = medium-agnostic
  is_active: boolean;
  created_at: string;
}

// A member-proposed weekly prompt. `media_name` null = "medium agnostic".
// `username` is populated in the admin queue view.
export interface PromptSuggestionOut {
  id: string;
  username: string | null;
  media_id: string | null;
  media_name: string | null;
  prompt_text: string;
  status: string; // proposed | approved | rejected
  order_index: number | null;
  created_at: string;
}

export interface AdminPromptQueueOut {
  proposed: PromptSuggestionOut[];
  up_next: PromptSuggestionOut[];
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
  series_id: string | null;
  series_name: string | null;
  order_index: number | null;
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
  series_name?: string | null;
  clear_series?: boolean;
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
  // Album name — the audio flavour of a series (created server-side on demand).
  series_name?: string;
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
  // Album membership (an album is a series of audio pieces).
  series_id: string | null;
  series_name: string | null;
  order_index: number | null;
}

export interface AudioUpdatePayload {
  title: string;
  date?: string | null;
  keywords?: string[] | null;
  comments_enabled?: boolean;
  medium?: string | null;
  artist?: string | null;
  duration_seconds?: number | null;
  series_name?: string | null;
  clear_series?: boolean;
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
  // 'visual_2d' | 'written_form' (from the Art.type discriminator). Absent on
  // older backends — treat missing as a visual piece.
  art_type?: string | null;
  keywords: string[];
  song: string | null;
  file_path: string;
  date: string | null;
  location: string | null;
  creator_username: string;
  creator_city: string | null;
  aspect_ratio: number | null;
}

// A member's saved piece (any medium), shaped like a gallery card. Mirrors the
// backend BookmarkedArtOut — enough to render the tile plus who made it and when
// it was saved.
export interface BookmarkedArtOut {
  art_id: string;
  title: string;
  // 'visual_2d' | 'written_form' | 'audio' (Art.type discriminator).
  art_type: string;
  medium: string;
  file_path: string | null;
  date: string | null;
  creator_username: string;
  aspect_ratio: number | null;
  // Set when the piece belongs to a collection/album/series (absent on older
  // backends until the series-fields change deploys). Lets the saved page
  // regroup pieces into one collection tile.
  series_id?: string | null;
  series_name?: string | null;
  bookmarked_at: string;
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

// The three medium categories a piece can belong to. Used when a requester
// proposes a new media form so the admin no longer has to classify it.
export type MediaTypeKind = 'visual_2d' | 'written_form' | 'audio';

export interface FeatureRequestOut {
  id: string;
  // Requester — only present when the viewer is an admin.
  username: string | null;
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

// Admin role-management panel: every member with their role tier.
export type MemberRole = 'member' | 'contributor' | 'admin';

export interface AdminMemberOut {
  username: string;
  firstname: string | null;
  lastname: string | null;
  role: MemberRole;
}

export interface ParticipantOut {
  username: string;
  firstname: string | null;
  lastname: string | null;
  role: string;
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
  edited_at?: string | null;
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
  // What the requester picked at submission ("visual_2d" | "written_form" |
  // "audio"). Null on rows created before requesters chose their own type.
  requested_type: string | null;
  resolved_type: string | null;
  created_at: string;
}

// --- Events -------------------------------------------------------------------

export interface EventOut {
  id: string;
  title: string;
  description: string | null;
  event_date: string; // YYYY-MM-DD
  event_time: string | null; // HH:MM:SS
  image_path: string | null;
  color: string | null;
  is_public: boolean;
  creator_username: string;
  hosts: string[];
  // Only present when the viewer is a host/creator; invitees don't see the list.
  invited: string[] | null;
  can_edit: boolean;
  created_at: string;
}

export interface EventIn {
  title: string;
  description?: string | null;
  event_date: string; // YYYY-MM-DD (required)
  event_time?: string | null; // HH:MM (backend accepts HH:MM[:SS])
  is_public?: boolean;
  color?: string | null;
  hosts?: string[];
}

export interface EventUpdate {
  title?: string;
  description?: string | null;
  event_date?: string;
  event_time?: string | null;
  is_public?: boolean;
  color?: string | null;
}

// --- Observability summaries (contributor panel, #7) --------------------------

export interface DayCount {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface ActiveMember {
  username: string;
  firstname: string | null;
}

export interface UsageSummary {
  days: number;
  // "Visits" = app-use sessions (a member's activity split on >30min gaps), a
  // truer engagement signal than logins now that sessions slide and rarely
  // re-auth.
  total_visits: number;
  total_events: number;
  visits_per_day: DayCount[];
  active_per_day: DayCount[];
  // Who was active today (distinct members with any event today).
  active_today: ActiveMember[];
  top_screens: { screen: string; count: number }[];
}

export interface DeviceEventRecent {
  kind: string;
  platform: string | null;
  app_version: string | null;
  os_version: string | null;
  device_model: string | null;
  detail: string | null;
  occurred_at: string | null;
}

export interface TelemetrySummary {
  days: number;
  counts_by_kind: { kind: string; count: number }[];
  app_versions: { version: string; count: number }[];
  crashes_per_day: DayCount[];
  recent: DeviceEventRecent[];
}

// --- Announcements (contributor-authored feed + discussion) -------------------
export interface AnnouncementOut {
  id: string;
  title: string;
  body: string;
  author_username: string | null;
  author_firstname: string | null;
  comment_count: number;
  created_at: string;
}

export interface AnnouncementCommentOut {
  id: string;
  username: string;
  firstname: string | null;
  text: string;
  created_at: string;
}

export interface AnnouncementDetailOut extends AnnouncementOut {
  comments: AnnouncementCommentOut[];
}

// --- Docs (editable "about the app" sections) ---------------------------------
export interface DocOut {
  slug: string;
  section: string | null;
  title: string;
  body: string;
  order_index: number;
  updated_at: string | null;
}

// --- Infra health (Raspberry Pi host metrics; contributor "infra stats") ------
export interface InfraHealthOut {
  ok: boolean;
  // False when the host's /proc was unreadable (e.g. dev off-Linux) — show
  // "unavailable" instead of misleading zeros.
  host_metrics_available: boolean;
  kernel: string | null;
  uptime_seconds: number | null;
  temperature_c: number | null;
  cpu: {
    percent: number | null;
    cores: number | null;
    load_1: number | null;
    load_5: number | null;
    load_15: number | null;
  };
  memory: { total: number | null; used: number | null; available: number | null; percent: number | null };
  // System/SD-card filesystem (code + OS).
  disk: { path: string | null; total: number | null; used: number | null; free: number | null; percent: number | null };
  // The drive uploads actually live on (USB SSD) — the one that fills up.
  content_disk: { path: string | null; total: number | null; used: number | null; free: number | null; percent: number | null };
  // Size of the static-files volume (uploaded art + profile images).
  content: { path: string | null; bytes: number | null; files: number | null; truncated: boolean };
}
