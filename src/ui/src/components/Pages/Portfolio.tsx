import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useProfile } from "../../hooks/useProfile";
import PortfolioGrid from "../UserProfile/PortfolioGrid";
import "../../styles/portfolio.css";

// The shareable portfolio page (share links point here): one medium, as the
// same grid the profile's portfolio toggle shows.
const Portfolio = () => {
  const { username = "" } = useParams<{ username: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const medium = searchParams.get("medium") ?? "";
  const keywords = (searchParams.get("keywords") ?? "").split(",").filter(Boolean);
  const [profile] = useProfile(username);
  const headerParts = [medium, ...keywords].filter(Boolean);

  return (
    <div className="portfolio-page">
      <div className="portfolio-header">
        <span className="portfolio-artist">{profile ? `${profile.firstname} ${profile.lastname}` : `@${username}`}</span>
        {headerParts.length > 0 && <span className="portfolio-tags">{headerParts.join(" · ")}</span>}
        <div className="portfolio-view-toggle" onClick={() => navigate(`/members/${username}/profile`)}>profile view</div>
      </div>
      {medium && <PortfolioGrid username={username} medium={medium} keywords={keywords} />}
    </div>
  );
};

export default Portfolio;
