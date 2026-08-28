import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
    ApplicationApproveOut,
    ApplicationOut,
    get_applications,
    update_application_status,
    delete_application,
    MediaRequest,
    get_media_requests,
    update_media_request,
    ReportOut,
    get_reports,
    update_report_status,
    get_admin_prompt_queue,
    review_prompt_suggestion,
    activate_suggestion,
    get_active_prompt,
    PromptSuggestionOut,
    PromptOut,
} from "../../api";
import { useAuth } from "../../context/AuthContext";
import ConfirmDialog from "../Utils/ConfirmDialog";
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

const TempCreds = ({ password }: { password: string }) => {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        navigator.clipboard.writeText(password);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
    };
    return (
        <div className="temp-creds">
            <div className="temp-creds-row">
                <span className="temp-creds-label">setup code:</span>
                <code className="temp-creds-value">{password}</code>
                <button className="temp-creds-copy" onClick={copy}>
                    {copied ? "copied" : "copy"}
                </button>
            </div>
        </div>
    );
};

const ApplicationRow = ({
    app,
    onStatusChange,
    onDelete,
}: {
    app: ApplicationOut;
    onStatusChange: (id: string, status: string) => void;
    onDelete: (id: string) => void;
}) => {
    const [showConfirmDelete, setShowConfirmDelete] = useState(false);
    return (
        <div className="application-row-item">
            {showConfirmDelete && (
                <ConfirmDialog
                    onConfirm={() => {
                        setShowConfirmDelete(false);
                        onDelete(app.id);
                    }}
                    onCancel={() => setShowConfirmDelete(false)}
                />
            )}
            <div className="application-row-info">
                <p className="application-name">{app.firstname} {app.lastname}</p>
                <p className="application-meta">{app.email}</p>
                {(app.city || app.state) && <p className="application-meta">{[app.city, app.state].filter(Boolean).join(", ")}</p>}
                {app.known_member && <p className="application-meta">knows: {app.known_member}</p>}
                {app.reason && <p className="application-reason">"{app.reason}"</p>}
                <p className="application-date">{new Date(app.created_at).toLocaleDateString()}</p>
                {app.status === "pending_setup" && app.temp_password && (
                    <TempCreds password={app.temp_password} />
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
                <div className="application-btn reject" onClick={() => setShowConfirmDelete(true)}>
                    delete
                </div>
            </div>
        </div>
    );
};

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
                        <option value="written_form">written_form</option>
                    </select>
                )}
            </div>
        </div>
    );
};

type AdminTab = "applications" | "media-requests" | "reports" | "prompts";
const TABS: AdminTab[] = ["applications", "media-requests", "reports", "prompts"];

// One proposed / queued weekly-prompt suggestion. Proposed rows get approve /
// reject; approved ("up next") rows get "make this week's".
const PromptSuggestionRow = ({ s, onReview, onActivate }: {
    s: PromptSuggestionOut;
    onReview?: (id: string, status: "approved" | "rejected") => void;
    onActivate?: (id: string) => void;
}) => (
    <div className="application-row-item">
        <div className="application-row-info">
            <p className="application-name">{s.prompt_text}</p>
            <p className="application-meta">
                {s.media_name ?? "any medium"}{s.username ? `  ·  @${s.username}` : ""}
            </p>
        </div>
        <div className="application-row-actions">
            {onReview && (
                <div className="prompt-row-btns">
                    <button className="application-btn approve" onClick={() => onReview(s.id, "approved")}>approve</button>
                    <button className="application-btn reject" onClick={() => onReview(s.id, "rejected")}>reject</button>
                </div>
            )}
            {onActivate && (
                <button className="application-btn activate" onClick={() => onActivate(s.id)}>make this week's</button>
            )}
        </div>
    </div>
);

const Admin = () => {
    // The tab lives in the URL (?tab=) so Settings can deep-link into a section.
    const [searchParams, setSearchParams] = useSearchParams();
    const tabParam = searchParams.get("tab") as AdminTab | null;
    const tab: AdminTab = tabParam && TABS.includes(tabParam) ? tabParam : "applications";
    const setTab = (t: AdminTab) => setSearchParams({ tab: t });
    const [applications, setApplications] = useState<ApplicationOut[]>([]);
    const [mediaRequests, setMediaRequests] = useState<MediaRequest[]>([]);
    const [reports, setReports] = useState<ReportOut[]>([]);
    const [proposed, setProposed] = useState<PromptSuggestionOut[]>([]);
    const [upNext, setUpNext] = useState<PromptSuggestionOut[]>([]);
    const [activePrompt, setActivePrompt] = useState<PromptOut | null>(null);
    const { token } = useAuth()!;

    const fetchPrompts = () => {
        get_admin_prompt_queue(token)
            .then((q) => { setProposed(q.proposed); setUpNext(q.up_next); })
            .catch(console.error);
        get_active_prompt(token).then(setActivePrompt).catch(() => {});
    };

    useEffect(() => {
        get_applications(token).then(setApplications).catch(console.error);
        get_media_requests(token).then(setMediaRequests).catch(console.error);
        get_reports(token).then(setReports).catch(console.error);
        fetchPrompts();
    }, []);

    const handleReviewPrompt = async (id: string, status: "approved" | "rejected") => {
        try {
            await review_prompt_suggestion(id, status, token);
            fetchPrompts();
        } catch (err) {
            alert((err as Error).message || "couldn't update");
        }
    };

    const handleActivateSuggestion = async (id: string) => {
        try {
            await activate_suggestion(id, token);
            fetchPrompts();
        } catch (err) {
            alert((err as Error).message || "couldn't activate");
        }
    };

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
                ? { ...a, status: res.status, temp_password: res.temp_password }
                : a));
        } else {
            setApplications(apps => apps.map(a => a.id === id ? { ...a, status } : a));
        }
    };

    const handleDeleteApplication = async (id: string) => {
        setApplications(apps => apps.filter(a => a.id !== id));
        try {
            await delete_application(id, token);
        } catch {
            // refetch on failure to resync
            const fresh = await get_applications(token).catch(() => null);
            if (fresh) setApplications(fresh);
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
                <span
                    onClick={() => setTab("prompts")}
                    style={{ cursor: "pointer", opacity: tab === "prompts" ? 1 : 0.4 }}
                >prompts</span>
            </h1>

            {tab === "prompts" ? (
                <>
                    <div className="admin-section">
                        <h2 className="admin-section-title">this week's prompt</h2>
                        {activePrompt ? (
                            <div className="application-row-item">
                                <div className="application-row-info">
                                    <p className="application-name">{activePrompt.title}</p>
                                    <p className="application-meta">{activePrompt.media_name ?? "any medium"}</p>
                                </div>
                            </div>
                        ) : <p className="admin-empty">no active prompt</p>}
                    </div>
                    <div className="admin-section">
                        <h2 className="admin-section-title">up next</h2>
                        <p className="admin-hint">activate one to make it this week's (archives the current).</p>
                        {upNext.length === 0
                            ? <p className="admin-empty">nothing approved yet</p>
                            : upNext.map(s => (
                                <PromptSuggestionRow key={s.id} s={s} onActivate={handleActivateSuggestion} />
                            ))
                        }
                    </div>
                    <div className="admin-section">
                        <h2 className="admin-section-title">proposed</h2>
                        {proposed.length === 0
                            ? <p className="admin-empty">no proposed prompts</p>
                            : proposed.map(s => (
                                <PromptSuggestionRow key={s.id} s={s} onReview={handleReviewPrompt} />
                            ))
                        }
                    </div>
                </>
            ) : tab === "reports" ? (
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
                                <ApplicationRow key={a.id} app={a} onStatusChange={handleStatusChange} onDelete={handleDeleteApplication} />
                            ))
                        }
                    </div>
                    <div className="admin-section">
                        <h2 className="admin-section-title">awaiting setup</h2>
                        {pendingSetup.length === 0
                            ? <p className="admin-empty">none</p>
                            : pendingSetup.map(a => (
                                <ApplicationRow key={a.id} app={a} onStatusChange={handleStatusChange} onDelete={handleDeleteApplication} />
                            ))
                        }
                    </div>
                    <div className="admin-section">
                        <h2 className="admin-section-title">reviewed</h2>
                        {reviewed.length === 0
                            ? <p className="admin-empty">none yet</p>
                            : reviewed.map(a => (
                                <ApplicationRow key={a.id} app={a} onStatusChange={handleStatusChange} onDelete={handleDeleteApplication} />
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
