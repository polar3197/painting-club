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
  file: { uri: string; name: string; type: string };
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

export interface MediaType {
  id: string;
  name: string;
  type?: string | null;
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
