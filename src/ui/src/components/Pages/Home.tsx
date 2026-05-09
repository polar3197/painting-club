

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
              <p>Welcome to Painting Club.</p>
              <br></br>
              <p>I built this space for artists to share their art.</p>
              <br></br>
              <p>The goal is to center art and sincerity.</p>
              <br></br>
              <p>For friends who film, write, sing, sculpt and so on, I would love to chat about how Painting Club could best display your art form.</p>
              <br></br>
              <p>It's true, we can all use instagram, but I lowkey hate instagram and highkey don't like zuckerberg.</p> 
              <br></br>
              <p>I look forward to a version of Painting Club where artists are easily and securely able to share their work. A version where people inspire eachother and non of it chases virality or likes.</p> 
            </div>
          </div>
        {/* <div className="home-right">
          <Announcements />
        </div> */}
      </div>
    </main>
  );
}