import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { useProfile } from "../../hooks/useProfile";
import { Profile } from "../../api";
import UserDetails from "../UserProfile/UserDetails";
import MediaBar from "../UserProfile/MediaBar";
import Art from "../UserProfile/Art";

const UserProfile = () => {
  const { username } = useParams();
  const [profile, setProfile, error, loading] = useProfile(username);
  
  const [selectedMedium, setSelectedMedium] = useState<string | null>(null)
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([])
  const [refresh, setRefresh] = useState(0)
  const [availableKeywords, setAvailableKeywords] = useState<string[]>([])

  useEffect(() => {
    const updateMedia = () => {
      setSelectedMedium(profile?.media[0] ?? null);
    };

    updateMedia();
  }, [profile]);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Something went wrong</p>;
  if (!profile) return null;

  

  return (
    <>
      <UserDetails
        profile={profile}
        setProfile={setProfile}
        selectedMedium={selectedMedium}
        selectedKeywords={selectedKeywords}
      />
      <MediaBar
        profile={profile}
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
      />
    </>

  );
};

export default UserProfile;
