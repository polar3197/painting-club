import { useParams, useSearchParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { useProfile } from "../../hooks/useProfile";
import UserDetails from "../UserProfile/UserDetails";
import MediaBar from "../UserProfile/MediaBar";
import Art from "../UserProfile/Art";
import PortfolioGrid from "../UserProfile/PortfolioGrid";
import { profileColorVars } from "../../utils/profileColors";
import "../../styles/user-profile/profile-ios.css";

// Last-seen profile colors per member (localStorage), so the loading mock-up
// is in their scheme rather than grey.
const colorsKey = (u: string) => `pc:colors:${u.toLowerCase()}`;
function readSavedColors(username: string | undefined): Record<string, string> | null {
  if (!username) return null;
  try { return JSON.parse(localStorage.getItem(colorsKey(username)) ?? "null"); } catch { return null; }
}
function saveColors(username: string, colors: Record<string, string> | null | undefined) {
  try { localStorage.setItem(colorsKey(username), JSON.stringify(colors ?? null)); } catch { /* private mode */ }
}

function ProfileSkeleton({ colors }: { colors: Record<string, string> | null }) {
  return (
    <div className="profile-page profile-skeleton" style={profileColorVars(colors)} aria-busy="true">
      <div className="user-deets">
        <div className="user-body">
          <div className="user-col">
            <div className="user-identity">
              <span className="sk-bar" style={{ width: "80%", height: 24 }} />
              <span className="sk-bar" style={{ width: "50%", height: 14 }} />
            </div>
          </div>
          <div className="statement-strip">
            <div className="user-field-element">
              <span className="artist-statement-label">Artist Statement</span>
              <hr />
              <span className="sk-bar" style={{ width: "100%", height: 10 }} />
              <span className="sk-bar" style={{ width: "90%", height: 10 }} />
              <span className="sk-bar" style={{ width: "60%", height: 10 }} />
            </div>
          </div>
          <div className="user-profile-pic empty-pic" />
        </div>
      </div>
      <div className="media-bar-wrapper">
        <div className="media-bar-box">
          <div className="media-bar">
            <div className="media-element selected">&nbsp;</div>
            <div className="media-element">&nbsp;</div>
          </div>
        </div>
      </div>
      <div className="art-wrapper">
        <div className="art">
          {[0, 1].map((i) => (
            <div key={i} className="art-element">
              <div className="art-visual"><div className="sk-art" /></div>
              <div className="art-right"><span className="sk-bar" style={{ width: "55%", height: 20 }} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const UserProfile = () => {
  const { username } = useParams();
  const [searchParams] = useSearchParams();
  const [profile, setProfile, error, loading] = useProfile(username);

  const [jumpTo, setJumpTo] = useState<string | null>(null);
  const scrollToArtId = jumpTo ?? searchParams.get("artId");
  const mediumParam = searchParams.get("medium");

  const [selectedMedium, setSelectedMedium] = useState<string | null>(mediumParam ?? null)
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([])
  const [refresh, setRefresh] = useState(0)
  const [availableKeywords, setAvailableKeywords] = useState<string[]>([])
  // Portfolio toggle: while on, the selected medium shows as the masonry grid
  // in place of the rows below the media bar.
  const [portfolioMode, setPortfolioMode] = useState(false)

  useEffect(() => {
    if (!mediumParam) setSelectedMedium(profile?.media[0] ?? null);
  }, [profile]);

  // Nothing to show yet (first visit, or the Pi is unreachable): the page's
  // own layout in this member's last-seen colors instead of a message.
  if (!profile) {
    if (!loading && !error) return null;
    return <ProfileSkeleton colors={readSavedColors(username)} />;
  }
  saveColors(profile.username, profile.profile_colors);


  // The member's color scheme (shared with the iOS app) as CSS variables the
  // profile stylesheets read; defaults apply for anyone who never customized.
  return (
    <div className="profile-page" style={profileColorVars(profile.profile_colors)}>
      <UserDetails
        profile={profile}
        setProfile={setProfile}
        onOpenComment={(artId, medium) => { setPortfolioMode(false); setSelectedMedium(medium); setSelectedKeywords([]); setJumpTo(artId); }}
      />
      <MediaBar
        profile={profile}
        setProfile={setProfile}
        selectedMedium={selectedMedium}
        setSelectedMedium={(m) => { setSelectedMedium(m); setSelectedKeywords([]); }}
        selectedKeywords={selectedKeywords}
        setSelectedKeywords={setSelectedKeywords}
        availableKeywords={availableKeywords}
        portfolioMode={portfolioMode}
        onTogglePortfolio={() => setPortfolioMode((m) => !m)}
      />
      {portfolioMode && selectedMedium ? (
        <div className="profile-portfolio">
          <PortfolioGrid username={profile.username} medium={selectedMedium} keywords={selectedKeywords} />
        </div>
      ) : (
      <Art
        profile={profile}
        selectedMedium={selectedMedium}
        selectedKeywords={selectedKeywords}
        refresh={refresh}
        onRefresh={() => setRefresh(r => r + 1)}
        onKeywordsLoaded={setAvailableKeywords}
        scrollToArtId={scrollToArtId}
        onMoved={(newMedium) => {
          setProfile(p => (p && !p.media.includes(newMedium) ? { ...p, media: [...p.media, newMedium] } : p));
          setSelectedMedium(newMedium);
          setSelectedKeywords([]);
          setRefresh(r => r + 1);
        }}
      />
      )}
    </div>
  );
};

export default UserProfile;
