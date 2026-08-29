import { useParams, useSearchParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { useProfile } from "../../hooks/useProfile";
import UserDetails from "../UserProfile/UserDetails";
import MediaBar from "../UserProfile/MediaBar";
import Art from "../UserProfile/Art";
import { profileColorVars } from "../../utils/profileColors";

const UserProfile = () => {
  const { username } = useParams();
  const [searchParams] = useSearchParams();
  const [profile, setProfile, error, loading] = useProfile(username);

  const scrollToArtId = searchParams.get("artId");
  const mediumParam = searchParams.get("medium");

  const [selectedMedium, setSelectedMedium] = useState<string | null>(mediumParam ?? null)
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([])
  const [refresh, setRefresh] = useState(0)
  const [availableKeywords, setAvailableKeywords] = useState<string[]>([])

  useEffect(() => {
    if (!mediumParam) setSelectedMedium(profile?.media[0] ?? null);
  }, [profile]);

  if (loading) return <p>Loading...</p>;
  if (error) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px" }}>
      <p style={{ maxWidth: 520, textAlign: "center", margin: 0 }}>Sorry guys, the power source to the raspberry pi this app runs on is weak and it keeps dying. Will be getting it more power soon.</p>
    </div>
  );
  if (!profile) return null;

  

  // The member's color scheme (shared with the iOS app) as CSS variables the
  // profile stylesheets read; defaults apply for anyone who never customized.
  return (
    <div className="profile-page" style={profileColorVars(profile.profile_colors)}>
      <UserDetails
        profile={profile}
        setProfile={setProfile}
        selectedMedium={selectedMedium}
        selectedKeywords={selectedKeywords}
      />
      <MediaBar
        profile={profile}
        setProfile={setProfile}
        selectedMedium={selectedMedium}
        setSelectedMedium={(m) => { setSelectedMedium(m); setSelectedKeywords([]); }}
        selectedKeywords={selectedKeywords}
        setSelectedKeywords={setSelectedKeywords}
        availableKeywords={availableKeywords}
      />
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
    </div>
  );
};

export default UserProfile;
