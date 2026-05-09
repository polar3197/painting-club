import { useState, useEffect } from "react";
import {
    ApplicationApproveOut,
    ApplicationOut,
    get_applications,
    update_application_status,
    MediaRequest,
    get_media_requests,
    update_media_request,
    ReportOut,
    get_reports,
    update_report_status,
} from "../../api";
import "../../styles/admin.css";

const statusColor: Record<string, string> = {
    pending: "rgb(238, 190, 100)",
    pending_setup: "lightblue",
    approved: "lightgreen",
    rejected: "lightcoral",
    resolved: "lightgreen",
    dismissed: "lightcoral",
};

const ReportRow = ({
    report,
    onResolve,
}: {
    report: ReportOut;
    onResolve: (id: string, status: "resolved" | "dismissed") => void;
}) => (
    <div className="application-row-item">
        <div className="application-row-info">
            <p className="application-name">
                {report.target_type}: {report.target_preview ?? "(target removed)"}
            </p>
            <p className="application-meta">by @{report.reporter_username}</p>
            {report.reason && <p className="application-reason">"{report.reason}"</p>}
            <p className="application-date">{new Date(report.created_at).toLocaleDateString()}</p>
        </div>
        <div className="application-row-actions">
            <div
                className="application-status"
                style={{ backgroundColor: statusColor[report.status] ?? "white" }}
            >
                {report.status}
            </div>
            {report.status === "pending" && (
                <>
                    <div className="application-btn approve" onClick={() => onResolve(report.id, "resolved")}>
                        resolve
                    </div>
                    <div className="application-btn reject" onClick={() => onResolve(report.id, "dismissed")}>
                        dismiss
                    </div>
                </>
            )}
        </div>
    </div>
);

const TempCreds = ({ email, password }: { email: string; password: string }) => {
    const [copied, setCopied] = useState<"" | "email" | "pw">("");
    const copy = (value: string, which: "email" | "pw") => {
        navigator.clipboard.writeText(value);
        setCopied(which);
        setTimeout(() => setCopied(""), 1200);
    };
    return (
        <div className="temp-creds">
            <div className="temp-creds-row">
                <span className="temp-creds-label">login email:</span>
                <code className="temp-creds-value">{email}</code>
                <button className="temp-creds-copy" onClick={() => copy(email, "email")}>
                    {copied === "email" ? "copied" : "copy"}
                </button>
            </div>
            <div className="temp-creds-row">
                <span className="temp-creds-label">setup code:</span>
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
            {app.status === "pending_setup" && app.temp_email && app.temp_password && (
                <TempCreds email={app.temp_email} password={app.temp_password} />
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

const MediaRequestRow = ({
    req,
    onResolve,
}: {
    req: MediaRequest;
    onResolve: (id: string, status: "approved" | "rejected", type: string | null, name: string | null) => void;
}) => {
    const [pickingType, setPickingType] = useState(false);
    const [editName, setEditName] = useState(req.requested_name);

    const finalName = () => {
        const n = editName.trim();
        return n && n !== req.requested_name ? n : null;
    };

    return (
        <div className="application-row-item">
            <div className="application-row-info">
                {pickingType ? (
                    <input
                        className="application-name"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        style={{ border: "1px solid #ccc", padding: "2px 4px", fontFamily: "inherit", fontSize: "inherit", minWidth: 0, width: "100%", boxSizing: "border-box" }}
                    />
                ) : (
                    <p className="application-name">{req.requested_name}</p>
                )}
                <p className="application-meta">@{req.username}</p>
                {req.resolved_type && <p className="application-meta">type: {req.resolved_type}</p>}
                <p className="application-date">{new Date(req.created_at).toLocaleDateString()}</p>
            </div>
            <div className="application-row-actions">
                <div
                    className="application-status"
                    style={{ backgroundColor: statusColor[req.status] ?? "white" }}
                >
                    {req.status}
                </div>
                {req.status === "pending" && !pickingType && (
                    <>
                        <div className="application-btn approve" onClick={() => setPickingType(true)}>approve</div>
                        <div className="application-btn reject" onClick={() => onResolve(req.id, "rejected", null, null)}>reject</div>
                    </>
                )}
                {req.status === "pending" && pickingType && (
                    <select
                        defaultValue=""
                        style={{ fontFamily: "'Times New Roman', Times, serif", padding: "2px 4px" }}
                        onChange={(e) => {
                            if (e.target.value) onResolve(req.id, "approved", e.target.value, finalName());
                        }}
                    >
                        <option value="" disabled>pick type</option>
                        <option value="visual_2d">visual_2d</option>
                        <option value="written_word">written_word</option>
                    </select>
                )}
            </div>
        </div>
    );
};

const Admin = () => {
    const [tab, setTab] = useState<"applications" | "media-requests" | "reports">("applications");
    const [applications, setApplications] = useState<ApplicationOut[]>([]);
    const [mediaRequests, setMediaRequests] = useState<MediaRequest[]>([]);
    const [reports, setReports] = useState<ReportOut[]>([]);
    const token = localStorage.getItem("token");

    useEffect(() => {
        get_applications(token).then(setApplications).catch(console.error);
        get_media_requests(token).then(setMediaRequests).catch(console.error);
        get_reports(token).then(setReports).catch(console.error);
    }, []);

    const handleResolveReport = async (id: string, status: "resolved" | "dismissed") => {
        const res = await update_report_status(id, status, token);
        setReports(prev => prev.map(r => r.id === id ? res : r));
    };

    const handleStatusChange = async (id: string, status: string) => {
        const res = await update_application_status(id, status, token);
        const isApproval = (r: unknown): r is ApplicationApproveOut =>
            !!r && typeof r === "object" && "temp_password" in (r as object);

        if (status === "approved" && isApproval(res)) {
            setApplications(apps => apps.map(a => a.id === id
                ? { ...a, status: res.status, temp_email: res.temp_email, temp_password: res.temp_password }
                : a));
        } else {
            setApplications(apps => apps.map(a => a.id === id ? { ...a, status } : a));
        }
    };

    const handleResolveRequest = async (id: string, status: "approved" | "rejected", type: string | null) => {
        const res = await update_media_request(id, status, type, token);
        setMediaRequests(prev => prev.map(r => r.id === id ? res : r));
    };

    const pending = applications.filter(a => a.status === "pending");
    const pendingSetup = applications.filter(a => a.status === "pending_setup");
    const reviewed = applications.filter(a => !["pending", "pending_setup"].includes(a.status));

    const pendingRequests = mediaRequests.filter(r => r.status === "pending");
    const reviewedRequests = mediaRequests.filter(r => r.status !== "pending");

    const pendingReports = reports.filter(r => r.status === "pending");
    const reviewedReports = reports.filter(r => r.status !== "pending");

    return (
        <div className="admin-page">
            <h1 className="admin-title">
                <span
                    onClick={() => setTab("applications")}
                    style={{ cursor: "pointer", opacity: tab === "applications" ? 1 : 0.4 }}
                >applications</span>
                <span
                    onClick={() => setTab("media-requests")}
                    style={{ cursor: "pointer", opacity: tab === "media-requests" ? 1 : 0.4 }}
                >media requests</span>
                <span
                    onClick={() => setTab("reports")}
                    style={{ cursor: "pointer", opacity: tab === "reports" ? 1 : 0.4 }}
                >reports</span>
            </h1>

            {tab === "reports" ? (
                <>
                    <div className="admin-section">
                        <h2 className="admin-section-title">pending</h2>
                        {pendingReports.length === 0
                            ? <p className="admin-empty">no pending reports</p>
                            : pendingReports.map(r => (
                                <ReportRow key={r.id} report={r} onResolve={handleResolveReport} />
                            ))
                        }
                    </div>
                    <div className="admin-section">
                        <h2 className="admin-section-title">reviewed</h2>
                        {reviewedReports.length === 0
                            ? <p className="admin-empty">none yet</p>
                            : reviewedReports.map(r => (
                                <ReportRow key={r.id} report={r} onResolve={handleResolveReport} />
                            ))
                        }
                    </div>
                </>
            ) : tab === "applications" ? (
                <>
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
                </>
            ) : (
                <>
                    <div className="admin-section">
                        <h2 className="admin-section-title">pending</h2>
                        {pendingRequests.length === 0
                            ? <p className="admin-empty">no pending requests</p>
                            : pendingRequests.map(r => (
                                <MediaRequestRow key={r.id} req={r} onResolve={handleResolveRequest} />
                            ))
                        }
                    </div>
                    <div className="admin-section">
                        <h2 className="admin-section-title">reviewed</h2>
                        {reviewedRequests.length === 0
                            ? <p className="admin-empty">none yet</p>
                            : reviewedRequests.map(r => (
                                <MediaRequestRow key={r.id} req={r} onResolve={handleResolveRequest} />
                            ))
                        }
                    </div>
                </>
            )}
        </div>
    );
};

export default Admin;
