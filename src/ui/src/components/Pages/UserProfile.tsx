import { useParams } from "react-router-dom";
import { Dispatch, SetStateAction, useState } from "react";
import { useProfile } from "../../hooks/useProfile";
import { Profile } from "../../api";
import UserDetails from "../UserProfile/UserDetails";
import MediaBar from "../UserProfile/MediaBar";
import Art from "../UserProfile/Art";

const UserProfile = () => {
  const { username } = useParams();
  const [profile, setProfile, error, loading] = useProfile(username);
  
  const [editMode, setEditMode] = useState<boolean>(false);
  const [selectedMedium, setSelectedMedium] = useState<string | null>(null)

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Something went wrong</p>;
  if (!profile) return null;

  return (
    <>
      <UserDetails
        profile={profile}
        setProfile={setProfile}
        editMode={editMode}
        setEditMode={setEditMode}
      />
      <MediaBar 
        profile={profile}
        setSelectedMedium={setSelectedMedium}
      />
      <Art 
        profile={profile}
        selectedMedium={selectedMedium}
      />
    </>

  );
};

export default UserProfile;
