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
  Me: undefined;
  Admin: undefined;
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
  ComingSoon: { title?: string };
  RequestFeature: undefined;
};
