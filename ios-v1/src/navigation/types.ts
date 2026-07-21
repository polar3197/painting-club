import type { AboutSectionKey } from '../constants/aboutContent';

export type AuthStackParamList = {
  LandingPage: undefined;
  NotMember: undefined;
  People: undefined;
  UserProfile: { username: string; artId?: string; medium?: string };
};

export type MainTabParamList = {
  Home: undefined;
  SearchTab: undefined;
  AddTab: undefined;
  Bookmark: undefined;
  Me: undefined;
  Admin: undefined;
};

// The Bookmark tab is its own stack so a saved piece opens the creator's profile
// (scoped to the tapped piece) without leaving the tab — mirrors SearchStack.
export type BookmarkStackParamList = {
  Bookmarks: undefined;
  UserProfile: { username: string; artId?: string; medium?: string };
};

// Art + People search now live behind a single tab. The two galleries are
// rendered side-by-side inside SearchTabs (a swipeable pager, not a
// navigator), so UserProfile is the only pushed screen and is shared by both.
export type SearchStackParamList = {
  SearchTabs: undefined;
  UserProfile: { username: string; artId?: string; medium?: string };
};

export type HomeStackParamList = {
  HomeFeed: undefined;
  WeeklyPromptDetail: { promptId: string };
  About: undefined;
  AboutSection: { section: AboutSectionKey };
  AboutPost: { section: AboutSectionKey; postIndex: number };
  AboutDoc: { slug?: string; section?: AboutSectionKey; create?: boolean };
  ComingSoon: { title?: string };
  RequestFeature: undefined;
  AnnouncementsFeed: undefined;
  AnnouncementDetail: { id: string };
  // focusDate (YYYY-MM-DD): open the calendar on that day/month — a freshly
  // created event hands its own date back so you land on it.
  Events: { focusDate?: string } | undefined;
  EventDetail: { eventId: string };
  EventEdit: { eventId?: string };
};
