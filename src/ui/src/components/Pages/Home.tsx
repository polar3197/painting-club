

import Announcements from "../Utils/Announcements";
import "../../styles/app-layout.css";
import "../../styles/home.css";

const HomeConfig = {
  // coords are measured in rem from bottom left
  "login_left": 32,
  "login_bottom": 16,
  "login_background_color": "lightgreen",
  // coords are measured in rem from bottom left
  "title_left": 14,
  "title_bottom": 36,
  // coords are measured in rem from bottom left
  "announcements_left": 45,
  "announcements_bottom": 3
}

export default function Home() {
  // pick a random number
  const config = HomeConfig;

  return (
    <main className="page">
      <div className="home">
        <div className="home-left">
          <div className="home-left-top">
            <div className="home-left-title">-• Painting Club •-</div>
            
          </div>
          <div className="home-left-content">
            <div className="painting-club-message">
              <p>Welcome to Painting Club</p>
              <br></br>
              <p>I built this space for artists to share their art.</p>
              <br></br>
              <p>I could've use instagram but I lowkey hate instagram and highkey don't like zuckerberg.</p> 
              <br></br>
              <p>With a painting club account you can set you art to be visible to everyone, only members or just yourself.</p> 
              <br></br>
              <p>This protects content from web crawlers and bots in a way large platforms can't and choose not to.</p>
              <br></br>
              <p>Right now it works for photography and painting, drawing, etc. (you get the idea0)... but in the future I would love to expand to writing, song and film (probably in that order).</p>
              <br></br>
            </div>
          </div>
        </div>
        <div className="home-right">
          <Announcements />
        </div>
      </div>
    </main>
  );
}