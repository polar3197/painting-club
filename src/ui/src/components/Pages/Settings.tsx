import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { export_my_data } from "../../api";
import ConfirmDialog from "../Utils/ConfirmDialog";
import DeleteAccountDialog from "../Utils/DeleteAccountDialog";
import "../../styles/settings.css";

// Reached from the gear on one's own profile. Mirrors the iOS Settings screen:
// delete account up top (deliberately out of the way), admin shortcuts into
// /admin's tabs, and logout at the bottom. Logout used to live in the sidebar.
export default function Settings() {
  const navigate = useNavigate();
  const { token, currentUser, currentRole, logout } = useAuth()!;
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [exporting, setExporting] = useState(false);

  const isStaff = currentRole === "admin" || currentRole === "contributor";

  const signOut = () => {
    logout();
    navigate("/landing-page");
  };

  const downloadMyData = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const data = await export_my_data(token);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `painting-club-${currentUser ?? "me"}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert((err as Error).message || "could not export your data");
    } finally {
      setExporting(false);
    }
  };

  return (
    <main className="page settings-page">
      {showLogoutConfirm && (
        <ConfirmDialog
          message="u sure?"
          confirmLabel="yes"
          cancelLabel="no. shit. stop"
          onConfirm={() => { setShowLogoutConfirm(false); signOut(); }}
          onCancel={() => setShowLogoutConfirm(false)}
        />
      )}
      <DeleteAccountDialog
        open={showDeleteDialog}
        username={currentUser ?? ""}
        onClose={() => setShowDeleteDialog(false)}
        onDeleted={() => { setShowDeleteDialog(false); signOut(); }}
      />

      <div className="settings-inner">
        <h1 className="settings-title">settings</h1>

        {/* Staff accounts can't self-delete (same rule as iOS). */}
        {currentUser && !isStaff && (
          <div className="settings-section settings-danger">
            <button className="settings-btn settings-btn-danger" onClick={() => setShowDeleteDialog(true)}>
              delete acc
            </button>
          </div>
        )}

        <div className="settings-spacer" />

        {isStaff && (
          <div className="settings-section">
            <h2 className="settings-section-title">admin</h2>
            <button className="settings-btn settings-btn-admin" onClick={() => navigate("/admin?tab=applications")}>applications</button>
            <button className="settings-btn settings-btn-admin" onClick={() => navigate("/admin?tab=media-requests")}>media requests</button>
            <button className="settings-btn settings-btn-admin" onClick={() => navigate("/admin?tab=reports")}>reports</button>
            <button className="settings-btn settings-btn-admin" onClick={() => navigate("/admin?tab=prompts")}>prompts</button>
          </div>
        )}

        <div className="settings-section">
          <h2 className="settings-section-title">account</h2>
          <button className="settings-btn" onClick={downloadMyData} disabled={exporting}>
            {exporting ? "preparing…" : "download my data"}
          </button>
          <button className="settings-btn settings-btn-logout" onClick={() => setShowLogoutConfirm(true)}>
            logout
          </button>
        </div>
      </div>
    </main>
  );
}
