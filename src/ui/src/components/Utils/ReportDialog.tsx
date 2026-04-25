import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { submit_report } from "../../api";
import "../../styles/utils/report-dialog.css";

interface Props {
    open: boolean;
    targetType: 'art' | 'comment';
    targetId: string | null;
    onClose: () => void;
}

export default function ReportDialog({ open, targetType, targetId, onClose }: Props) {
    const auth = useAuth();
    const token = localStorage.getItem("token");
    const [reason, setReason] = useState("");
    const [submitting, setSubmitting] = useState(false);

    if (!open) return null;

    const handleSubmit = async () => {
        if (!targetId) return;
        setSubmitting(true);
        try {
            await submit_report(targetType, targetId, reason.trim() || null, token);
            setReason("");
            onClose();
        } catch (err: any) {
            alert(err?.message || "Could not send the report.");
        } finally {
            setSubmitting(false);
        }
        // referenced to keep useAuth import valid even if currentUser unused here
        void auth;
    };

    const handleCancel = () => {
        setReason("");
        onClose();
    };

    return (
        <div className="report-backdrop" onClick={handleCancel}>
            <div className="report-dialog" onClick={(e) => e.stopPropagation()}>
                <div className="report-title">
                    report this {targetType === 'art' ? 'piece' : 'comment'}
                </div>
                <textarea
                    className="report-textarea"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="anything to add? (optional)"
                />
                <div className="report-buttons">
                    <button className="report-cancel" onClick={handleCancel} disabled={submitting}>
                        cancel
                    </button>
                    <button className="report-submit" onClick={handleSubmit} disabled={submitting}>
                        {submitting ? "sending..." : "send"}
                    </button>
                </div>
            </div>
        </div>
    );
}
