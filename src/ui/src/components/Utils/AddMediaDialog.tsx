import { useEffect, useState } from "react";
import { get_media, submit_media_request, MediaType } from "../../api";
import "../../styles/utils/add-media-dialog.css";

const AddMediaDialog = (
    { existing, onPick, onClose }
    :
    {
        existing: string[];
        onPick: (name: string) => void;
        onClose: () => void;
    }
) => {
    const [media, setMedia] = useState<MediaType[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [requestName, setRequestName] = useState("");
    const [requestSent, setRequestSent] = useState(false);
    const [requestError, setRequestError] = useState<string | null>(null);

    useEffect(() => {
        get_media()
            .then((rows) => setMedia(rows))
            .catch((e) => setError(e?.message || "failed to load media"));
    }, []);

    const available = (media ?? []).filter((m) => !existing.includes(m.name));

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

    return (
        <div className="add-media-backdrop" onClick={onClose}>
            <div className="add-media-dialog" onClick={(e) => e.stopPropagation()}>
                <div className="add-media-header">add artform</div>

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
                                    onPick(m.name);
                                    onClose();
                                }}
                            >
                                {m.name}
                            </button>
                        ))}
                    </div>
                )}

                <div className="add-media-request">
                    <div className="add-media-request-label">don't see it? request a new artform:</div>
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

                <div className="add-media-footer">
                    <button className="add-media-close" onClick={onClose}>close</button>
                </div>
            </div>
        </div>
    );
};

export default AddMediaDialog;
