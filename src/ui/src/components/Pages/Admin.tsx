import { useState, useEffect } from "react";
import { ApplicationApproveOut, ApplicationOut, get_applications, update_application_status } from "../../api";
import "../../styles/admin.css";

const statusColor: Record<string, string> = {
    pending: "rgb(238, 190, 100)",
    pending_setup: "lightblue",
    approved: "lightgreen",
    rejected: "lightcoral",
    resolved: "lightgreen",
};

const TempCreds = ({ username, password }: { username: string; password: string }) => {
    const [copied, setCopied] = useState<"" | "un" | "pw">("");
    const copy = (value: string, which: "un" | "pw") => {
        navigator.clipboard.writeText(value);
        setCopied(which);
        setTimeout(() => setCopied(""), 1200);
    };
    return (
        <div className="temp-creds">
            <div className="temp-creds-row">
                <span className="temp-creds-label">temp un:</span>
                <code className="temp-creds-value">{username}</code>
                <button className="temp-creds-copy" onClick={() => copy(username, "un")}>
                    {copied === "un" ? "copied" : "copy"}
                </button>
            </div>
            <div className="temp-creds-row">
                <span className="temp-creds-label">temp pw:</span>
                <code className="temp-creds-value">{password}</code>
                <button className="temp-creds-copy" onClick={() => copy(password, "pw")}>
                    {copied === "pw" ? "copied" : "copy"}
                </button>
            </div>
        </div>
    );
};

const ApplicationRow = ({
    app,
    onStatusChange,
}: {
    app: ApplicationOut;
    onStatusChange: (id: string, status: string) => void;
}) => (
    <div className="application-row-item">
        <div className="application-row-info">
            <p className="application-name">{app.firstname} {app.lastname}</p>
            <p className="application-meta">{app.email}</p>
            {(app.city || app.state) && <p className="application-meta">{[app.city, app.state].filter(Boolean).join(", ")}</p>}
            {app.known_member && <p className="application-meta">knows: {app.known_member}</p>}
            {app.reason && <p className="application-reason">"{app.reason}"</p>}
            <p className="application-date">{new Date(app.created_at).toLocaleDateString()}</p>
            {app.status === "pending_setup" && app.temp_username && app.temp_password && (
                <TempCreds username={app.temp_username} password={app.temp_password} />
            )}
        </div>
        <div className="application-row-actions">
            <div
                className="application-status"
                style={{ backgroundColor: statusColor[app.status] ?? "white" }}
            >
                {app.status.replace("_", " ")}
            </div>
            {app.status === "pending" && (
                <>
                    <div className="application-btn approve" onClick={() => onStatusChange(app.id, "approved")}>
                        approve
                    </div>
                    <div className="application-btn reject" onClick={() => onStatusChange(app.id, "rejected")}>
                        reject
                    </div>
                </>
            )}
        </div>
    </div>
);

const Admin = () => {
    const [applications, setApplications] = useState<ApplicationOut[]>([]);
    const token = sessionStorage.getItem("token");

    useEffect(() => {
        get_applications(token).then(setApplications).catch(console.error);
    }, []);

    const handleStatusChange = async (id: string, status: string) => {
        const res = await update_application_status(id, status, token);
        const isApproval = (r: unknown): r is ApplicationApproveOut =>
            !!r && typeof r === "object" && "temp_password" in (r as object);

        if (status === "approved" && isApproval(res)) {
            setApplications(apps => apps.map(a => a.id === id
                ? { ...a, status: res.status, temp_username: res.temp_username, temp_password: res.temp_password }
                : a));
        } else {
            setApplications(apps => apps.map(a => a.id === id ? { ...a, status } : a));
        }
    };

    const pending = applications.filter(a => a.status === "pending");
    const pendingSetup = applications.filter(a => a.status === "pending_setup");
    const reviewed = applications.filter(a => !["pending", "pending_setup"].includes(a.status));

    return (
        <div className="admin-page">
            <h1 className="admin-title">applications</h1>
            <div className="admin-section">
                <h2 className="admin-section-title">pending</h2>
                {pending.length === 0
                    ? <p className="admin-empty">no pending applications</p>
                    : pending.map(a => (
                        <ApplicationRow key={a.id} app={a} onStatusChange={handleStatusChange} />
                    ))
                }
            </div>
            <div className="admin-section">
                <h2 className="admin-section-title">awaiting setup</h2>
                {pendingSetup.length === 0
                    ? <p className="admin-empty">none</p>
                    : pendingSetup.map(a => (
                        <ApplicationRow key={a.id} app={a} onStatusChange={handleStatusChange} />
                    ))
                }
            </div>
            <div className="admin-section">
                <h2 className="admin-section-title">reviewed</h2>
                {reviewed.length === 0
                    ? <p className="admin-empty">none yet</p>
                    : reviewed.map(a => (
                        <ApplicationRow key={a.id} app={a} onStatusChange={handleStatusChange} />
                    ))
                }
            </div>
        </div>
    );
};

export default Admin;
