import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Visual2DIn,
  WrittenFormIn,
  add_new_visual_2d,
  add_new_written_form,
  get_profile,
} from "../../api";
import { useAuth } from "../../context/AuthContext";
import AddArtDialog from "../Utils/AddArtDialog";
import "../../styles/share.css";

// The iOS "share" tab, simplified: pick one of your artforms, fill the same
// AddArtDialog the profile uses, land on your profile at that medium.
export default function Share() {
  const auth = useAuth();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const username = auth?.currentUser ?? null;

  const [media, setMedia] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!username) {
      navigate("/not-a-member");
      return;
    }
    get_profile(username, token)
      .then((p) => setMedia(p.media))
      .catch(() => setMedia([]))
      .finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const landOnProfile = (medium: string) => {
    navigate(`/members/${username}/profile?medium=${encodeURIComponent(medium)}`);
  };

  const handleCreate = async (payload: Visual2DIn) => {
    setUploading(true);
    try {
      await add_new_visual_2d(token, payload);
      landOnProfile(payload.medium);
    } catch (err) {
      alert((err as Error).message);
      setUploading(false);
    }
  };

  const handleCreateWrittenForm = async (payload: WrittenFormIn) => {
    setUploading(true);
    try {
      await add_new_written_form(token, payload);
      landOnProfile(payload.medium);
    } catch (err) {
      alert((err as Error).message);
      setUploading(false);
    }
  };

  if (!username) return null;

  return (
    <div className="share-page">
      <h2 className="share-heading">share a piece</h2>
      {uploading ? (
        <p className="share-muted">uploading...</p>
      ) : (
        <>
          <p className="share-muted">pick a medium</p>
          <div className="share-media-grid">
            {!loaded && <p className="share-muted">loading...</p>}
            {loaded && media.length === 0 && (
              <p className="share-muted">
                no artforms yet — add one from your profile first
              </p>
            )}
            {media.map((m) => (
              <button
                key={m}
                className={`share-medium-btn ${selected === m ? "active" : ""}`}
                onClick={() => {
                  setSelected(m);
                  setShowDialog(true);
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </>
      )}

      {showDialog && selected && (
        <AddArtDialog
          setShowDialog={setShowDialog}
          selectedMedium={selected}
          username={username}
          onSuccess={() => landOnProfile(selected)}
          onCreate={handleCreate}
          onCreateWrittenForm={handleCreateWrittenForm}
        />
      )}
    </div>
  );
}
