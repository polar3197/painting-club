import { useEffect, useMemo, useState } from "react";
import { get_media, submit_media_request, set_media_visibility, MediaType } from "../../api";
import "../../styles/utils/add-media-dialog.css";

type Tab = "hide-show" | "new";

const AddMediaDialog = (
    { shown, hidden, onAdd, onVisibilityChange, onClose }
    :
    {
        shown: string[];
        hidden: string[];
        onAdd: (name: string) => void;
        onVisibilityChange: (name: string, hidden: boolean) => void;
        onClose: () => void;
    }
) => {
    const [tab, setTab] = useState<Tab>("hide-show");
    const [media, setMedia] = useState<MediaType[] | null>(null);
    // Freeze the order of artforms at mount time so toggling doesn't reshuffle rows.
    const initialOrder = useMemo(() => [...shown, ...hidden], []); // eslint-disable-line react-hooks/exhaustive-deps
    const hiddenSet = new Set(hidden);
    const [error, setError] = useState<string | null>(null);
    const [requestName, setRequestName] = useState("");
    const [requestSent, setRequestSent] = useState(false);
    const [requestError, setRequestError] = useState<string | null>(null);

    useEffect(() => {
        get_media()
            .then((rows) => setMedia(rows))
            .catch((e) => setError(e?.message || "failed to load media"));
    }, []);

    const existing = new Set([...shown, ...hidden]);
    const available = (media ?? []).filter((m) => !existing.has(m.name));

    const handleRequest = async () => {
        const name = requestName.trim();
        if (!name) return;
        setRequestError(null);
        try {
            const token = localStorage.getItem("token");
            await submit_media_request(name, token);
            setRequestName("");
            setRequestSent(true);
            setTimeout(() => setRequestSent(false), 2500);
        } catch (e: any) {
            setRequestError(e?.message || "request failed");
        }
    };

    const toggleVisibility = async (name: string, makeHidden: boolean) => {
        try {
            const token = localStorage.getItem("token");
            await set_media_visibility(name, makeHidden, token);
            onVisibilityChange(name, makeHidden);
        } catch (e: any) {
            alert(e?.message || "failed");
        }
    };

    return (
        <div className="add-media-backdrop" onClick={onClose}>
            <div className="add-media-dialog" onClick={(e) => e.stopPropagation()}>
                <h1 className="add-media-title">
                    <span
                        onClick={() => setTab("hide-show")}
                        style={{ cursor: "pointer", opacity: tab === "hide-show" ? 1 : 0.4 }}
                    >hide/show artform</span>
                    <span
                        onClick={() => setTab("new")}
                        style={{ cursor: "pointer", opacity: tab === "new" ? 1 : 0.4 }}
                    >new artform</span>
                </h1>

                {tab === "hide-show" ? (
                    <div className="add-media-panel">
                        {initialOrder.length === 0 ? (
                            <div className="add-media-empty">no artforms on your profile yet — switch to "new artform"</div>
                        ) : (
                            <div className="add-media-toggle-list">
                                {initialOrder.map((name) => {
                                    const isHidden = hiddenSet.has(name);
                                    return (
                                        <div
                                            key={name}
                                            className={`add-media-toggle-row ${isHidden ? "is-hidden" : "is-shown"}`}
                                            onClick={() => toggleVisibility(name, !isHidden)}
                                        >
                                            <span className="toggle-state-label left">shown</span>
                                            <span className="toggle-state-label right">hidden</span>
                                            <span className="toggle-chip">{name}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="add-media-panel">
                        {error && <div className="add-media-error">{error}</div>}
                        {!error && media === null && <div className="add-media-loading">loading...</div>}
                        {!error && media !== null && available.length === 0 && (
                            <div className="add-media-empty">all artforms already on your profile</div>
                        )}
                        {!error && available.length > 0 && (
                            <div className="add-media-list">
                                {available.map((m) => (
                                    <button
                                        key={m.id}
                                        className="add-media-item"
                                        onClick={() => {
                                            onAdd(m.name);
                                            onClose();
                                        }}
                                    >
                                        {m.name}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="add-media-request">
                            <div className="add-media-request-label">propose a media form:</div>
                            <div className="add-media-request-row">
                                <input
                                    className="add-media-request-input"
                                    type="text"
                                    value={requestName}
                                    placeholder="artform name"
                                    onChange={(e) => setRequestName(e.target.value)}
                                />
                                <button className="add-media-request-btn" onClick={handleRequest}>request</button>
                            </div>
                            {requestSent && <div className="add-media-request-sent">request sent</div>}
                            {requestError && <div className="add-media-error">{requestError}</div>}
                        </div>
                    </div>
                )}

                <div className="add-media-footer">
                    <button className="add-media-close" onClick={onClose}>close</button>
                </div>
            </div>
        </div>
    );
};

export default AddMediaDialog;
