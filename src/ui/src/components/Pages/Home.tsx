

import "../../styles/app-layout.css";
import "../../styles/home.css"

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
            weekly prompt
          </div>
          
        </div>
        <div className="home-right">
            <div className="painting-club-message">
              <img src="/imgs/groups.png" alt="" className="painting-club-message-img" />
              <p>Welcome to Painting Club.</p>
              <br></br>
              <p>I built this space for artists to share their art.</p>
              <br></br>
              <p>The goal is to center art around sincerity.</p>
              <br></br>
              <p>I truly believe you see a person's intent in every brush stroke - and I am sure this goes for other mediums too.</p>
              <br></br>
              <p>As realism is conquered, abstract, impressionism, are all conquered as well, and AI can conquer the ones to come, it is the sincerity in art that shines through. Painting Club is for sincere art.</p>
              <br></br>
              <p>Its a random fun spot for art, a place to inspire and be inspired by others</p>
              <br></br>
              <p>— its kinda also my secret hope to create a internet haven, safe from algorithms and warped value systems.</p>
            </div>
          </div>
        {/* <div className="home-right">
          <Announcements />
        </div> */}
      </div>
    </main>
  );
}