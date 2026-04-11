export type AuthStackParamList = {
  LandingPage: undefined;
  NotMember: undefined;
  People: undefined;
  UserProfile: { username: string; artId?: string; medium?: string };
};

export type MainTabParamList = {
  Home: undefined;
  PeopleTab: undefined;
  ArtTab: undefined;
  Me: undefined;
  Admin: undefined;
  More: undefined;
};

export type PeopleStackParamList = {
  PeopleList: undefined;
  UserProfile: { username: string; artId?: string; medium?: string };
};

export type ArtStackParamList = {
  ArtGallery: undefined;
  UserProfile: { username: string; artId?: string; medium?: string };
};
