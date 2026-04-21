import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import UserProfile from "./components/Pages/UserProfile";
import LandingPage from "./components/LandingPage/LandingPage";
import People from "./components/Pages/People";
import ArtGallery from "./components/Pages/ArtGallery";
import Portfolio from "./components/Pages/Portfolio";
import NotMember from "./components/Pages/NotMember";
import Admin from "./components/Pages/Admin";
import PageLayout from "./components/Pages/PageLayout";
import Ethos from "./components/Pages/Ethos";
import Privacy from "./components/Pages/Privacy";
import Support from "./components/Pages/Support";
import SetupAccount from "./components/Pages/SetupAccount";
import "./styles/app-layout.css";
import Home from "./components/Pages/Home";

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

        {/* All sidebar pages live here */}
        <Route element={<PageLayout />}>
          <Route path="/not-a-member" element={<NotMember />} />
          <Route path="/home" element={<Home />} />
          <Route path="/members/:username/profile" element={<UserProfile />} />
          <Route path="/members" element={<People />} />
          <Route path="/art" element={<ArtGallery />} />
          <Route path="/admin" element={<Admin />} />

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
