import Announcements from "./Announcements";
import Login from "./Login";
import "../../styles/app-layout.css";

const image = "imgs/ma.png";

export default function LandingPage() {
  return (
    <main className="page">
      <img
        src={image}
        className="page-background"
        style={{ border: "1px black solid" }}
      />
      <div className="title">-• Painting Club •-</div>

      <Announcements />
      <Login />
    </main>
  );
}
