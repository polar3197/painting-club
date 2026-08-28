import { useState } from "react";
import { export_my_data, delete_account } from "../../api";
import "../../styles/utils/delete-account-dialog.css";
import { useAuth } from "../../context/AuthContext";

interface Props {
  open: boolean;
  username: string;
  onClose: () => void;
  onDeleted: () => void;
}

const DeleteAccountDialog = ({ open, username, onClose, onDeleted }: Props) => {
  const { token } = useAuth()!;
  const [typed, setTyped] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!open) return null;

  const matches = typed.trim() === username && username.length > 0;

  const handleClose = () => {
    if (deleting || downloading) return;
    setTyped("");
    setDownloaded(false);
    onClose();
  };

  const handleDownload = async () => {
    if (!token) return;
    setDownloading(true);
    try {
      const data = await export_my_data(token);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "painting-club-export.json";
      a.click();
      URL.revokeObjectURL(url);
      setDownloaded(true);
    } catch (err) {
      alert((err as Error).message || "could not export your data");
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!token || !matches) return;
    setDeleting(true);
    try {
      await delete_account(token);
      setTyped("");
      setDownloaded(false);
      onDeleted();
    } catch (err) {
      alert((err as Error).message || "could not delete account");
      setDeleting(false);
    }
  };

  return (
    <div className="delete-account-backdrop" onClick={handleClose}>
      <div className="delete-account-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="delete-account-title">delete account</div>
        <div className="delete-account-message">
          your art, comments, and profile will be permanently removed. this can't be undone.
        </div>

        <button
          className={`delete-account-download ${downloaded ? "done" : ""}`}
          onClick={handleDownload}
          disabled={downloading || deleting}
        >
          {downloading
            ? "downloading..."
            : downloaded
            ? "data downloaded ✓ (save images before deleting)"
            : "download a copy of my data"}
        </button>

        <label className="delete-account-label">type your username to confirm</label>
        <input
          className="delete-account-input"
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={username}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={deleting}
        />

        <div className="delete-account-buttons">
          <button
            className="delete-account-cancel"
            onClick={handleClose}
            disabled={deleting || downloading}
          >
            cancel
          </button>
          <button
            className="delete-account-confirm"
            onClick={handleDelete}
            disabled={!matches || deleting}
          >
            {deleting ? "deleting..." : "delete forever"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteAccountDialog;
