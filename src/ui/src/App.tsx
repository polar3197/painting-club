import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./components/LandingPage/Login";
import UserProfile from "./components/Pages/UserProfile";
import LandingPage from "./components/LandingPage/LandingPage";
import Profiles from "./components/Pages/Profiles";
import PageLayout from "./components/Pages/PageLayout";
import "./styles/app-layout.css";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/landing-page" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />

        {/* All sidebar pages live here */}
        <Route element={<PageLayout />}>
          <Route path="/members" element={<Profiles />} />
          <Route path="/members/:username/profile" element={<UserProfile />} />
          {/* <Route path="/groups" element={<Groups />} /> */}
        </Route>

        <Route path="/" element={<Navigate to="/landing-page" />} />
      </Routes>
    </BrowserRouter>
  );
}
