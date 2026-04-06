import Announcements from "../Utils/Announcements";
import Login from "./Login";
import "../../styles/app-layout.css";

const MiltonAvery = {
  "image": "imgs/ma.png",
  // coords are measured in rem from bottom left
  "login_left": 4,
  "login_bottom": 3,
  // coords are measured in rem from bottom left
  "title_left": 10,
  "title_bottom": 35,
  "login_background_color": "transparent",
  // coords are measured in rem from bottom left
  "announcements_left": 45,
  "announcements_bottom": 4
}

const Hopper = {
  "image": "imgs/hopper-barn.png",
  // coords are measured in rem from bottom left
  "login_left": 16,
  "login_bottom": 10,
  // coords are measured in rem from bottom left
  "title_left": 33,
  "title_bottom": 26,
  "login_background_color": "rgb(216, 64, 25)",
  // coords are measured in rem from bottom left
  "announcements_left": 55,
  "announcements_bottom": 18
}

const Diebenkorn = {
  "image": "imgs/diebenkorn.png",
  // coords are measured in rem from bottom left
  "login_left": 62,
  "login_bottom": 3,
  // coords are measured in rem from bottom left
  "title_left": 50,
  "title_bottom": 28,
  "login_background_color": "rgb(238, 114, 72)",
  // coords are measured in rem from bottom left
  "announcements_left": 3,
  "announcements_bottom": 3
}

const Klimpt = {
  "image": "imgs/klimpt.png",
  // coords are measured in rem from bottom left
  "login_left": 32,
  "login_bottom": 16,
  "login_background_color": "lightgreen",
  // coords are measured in rem from bottom left
  "title_left": 2,
  "title_bottom": 11,
  // coords are measured in rem from bottom left
  "announcements_left": 3,
  "announcements_bottom": 3
}

const Themes = [MiltonAvery, Hopper, Diebenkorn, Klimpt];

// const image = "imgs/ma.png";

export default function LandingPage() {
  // pick a random number
  const randomIndex = Math.floor(Math.random() * Themes.length);
  const theme = Themes[randomIndex];

  return (
    <main className="page">
      <img
        src={theme.image}
        className="page-background"
        style={{ border: "1px black solid" }}
      />
      <div className="title" style={{ bottom: `${theme.title_bottom}rem`, left: `${theme.title_left}rem`}}>-• Painting Club •-</div>

      {/* <Announcements 
        bottom={theme.announcements_bottom}
        left={theme.announcements_left}
      /> */}
      <Login 
        bottom={theme.login_bottom}
        left={theme.login_left}
        background_color={theme.login_background_color}
      />
    </main>
  );
}

