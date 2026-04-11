

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
              <p>Welcome to Painting Club.</p>
              <br></br>
              <p>I built this space for artists to share their art.</p>
              <br></br>
              <p>The goal is to center art and sincerity. There are no likes nor algorithm. Just friends, art and conversations.</p>
              <br></br>
              <p>It currently handles photography, painting, drawing, etc. — you get the idea, #2d-static-visual...</p>
              <br></br>
              <p>For friends who film, write, sing, sculpt, and so on and on, I would love to chat about how Painting Club could best display your art form.</p>
              <br></br>
              <p>It's true, we can all use instagram, but I lowkey hate instagram and highkey don't like zuckerberg.</p> 
              <br></br>
              <p>With a Painting Club account you can create custom portfolios with a few clicks and share them with anyone you want. You could also opt to hide all of your art so that only other members see it. Either way, your pick!</p> 
              {/* <br></br>
              <p>Small community has benefits. Painting Club can shield content from web crawlers and bots in a way large platforms can't and don't care to try. Privacy/ownership around art is important #eff-altman.</p>
              <br></br> */}
              
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