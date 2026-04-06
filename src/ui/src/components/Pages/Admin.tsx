import { useState, useEffect } from "react";
import { ApplicationOut, get_applications, update_application_status } from "../../api";
import "../../styles/admin.css";

const statusColor: Record<string, string> = {
    pending: "rgb(238, 190, 100)",
    approved: "lightgreen",
    rejected: "lightcoral",
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
        </div>
        <div className="application-row-actions">
            <div
                className="application-status"
                style={{ backgroundColor: statusColor[app.status] ?? "white" }}
            >
                {app.status}
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
        await update_application_status(id, status, token);
        setApplications(apps => apps.map(a => a.id === id ? { ...a, status } : a));
    };

    const pending = applications.filter(a => a.status === "pending");
    const reviewed = applications.filter(a => a.status !== "pending");

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
