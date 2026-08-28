import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import UserProfile from "./components/Pages/UserProfile";
import LandingPage from "./components/LandingPage/LandingPage";
import People from "./components/Pages/People";
import ArtGallery from "./components/Pages/ArtGallery";
import Portfolio from "./components/Pages/Portfolio";
import NotMember from "./components/Pages/NotMember";
import Join from "./components/Pages/Join";
import Admin from "./components/Pages/Admin";
import Settings from "./components/Pages/Settings";
import Contributor from "./components/Pages/Contributor";
import AnnouncementDetail from "./components/Pages/AnnouncementDetail";
import AnnouncementsFeed from "./components/Pages/AnnouncementsFeed";
import Events from "./components/Pages/Events";
import EventDetail from "./components/Pages/EventDetail";
import EventEdit from "./components/Pages/EventEdit";
import Messages from "./components/Pages/Messages";
import ConversationThread from "./components/Pages/ConversationThread";
import UserRoles from "./components/Pages/UserRoles";
import UserRoleDetail from "./components/Pages/UserRoleDetail";
import UserStats from "./components/Pages/UserStats";
import InfraStats from "./components/Pages/InfraStats";
import PageLayout from "./components/Pages/PageLayout";
import Ethos from "./components/Pages/Ethos";
import Privacy from "./components/Pages/Privacy";
import Support from "./components/Pages/Support";
import SetupAccount from "./components/Pages/SetupAccount";
import "./styles/app-layout.css";
import Home from "./components/Pages/Home";
import WeeklyPrompt from "./components/Pages/WeeklyPrompt";
import WeeklyPromptGrid from "./components/Pages/WeeklyPromptGrid";

export default function App() {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if ((e.target as HTMLElement).tagName === "IMG") e.preventDefault();
    };
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/landing-page" element={<LandingPage />} />
        {/* Flyer QR target: a standalone full-page request-account form. */}
        <Route path="/join" element={<Join />} />

        {/* All sidebar pages live here */}
        <Route element={<PageLayout />}>
          <Route path="/not-a-member" element={<NotMember />} />
          <Route path="/home" element={<Home />} />
          <Route path="/prompts/:id" element={<WeeklyPrompt />} />
          <Route path="/prompts/:id/grid" element={<WeeklyPromptGrid />} />
          <Route path="/members/:username/profile" element={<UserProfile />} />
          <Route path="/members" element={<People />} />
          <Route path="/art" element={<ArtGallery />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/settings" element={<Settings />} />
          {/* Contributor tooling (Settings → …). Static segments outrank the
              /:username catch-all below, so these never collide with it. */}
          <Route path="/contributor" element={<Contributor />} />
          <Route path="/announcements" element={<AnnouncementsFeed />} />
          <Route path="/announcements/:id" element={<AnnouncementDetail />} />
          <Route path="/events" element={<Events />} />
          <Route path="/events/new" element={<EventEdit />} />
          <Route path="/events/:id" element={<EventDetail />} />
          <Route path="/events/:id/edit" element={<EventEdit />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/messages/:id" element={<ConversationThread />} />
          <Route path="/user-roles" element={<UserRoles />} />
          <Route path="/user-roles/:username" element={<UserRoleDetail />} />
          <Route path="/user-stats" element={<UserStats />} />
          <Route path="/infra-stats" element={<InfraStats />} />

          {/* <Route path="/groups" element={<Groups />} /> */}
          <Route path="/:username" element={<UserProfile />} />
        </Route>

        <Route path="/" element={<Navigate to="/landing-page" />} />
        <Route path="/ethos" element={<Ethos />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/support" element={<Support />} />
        <Route path="/setup" element={<SetupAccount />} />
        <Route path="/members/:username/portfolio" element={<Portfolio />} />
      </Routes>
    </BrowserRouter>
  );
}
