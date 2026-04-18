import { useEffect, useState } from "react";
import { get_media, MediaType } from "../../api";
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

    useEffect(() => {
        get_media()
            .then((rows) => setMedia(rows))
            .catch((e) => setError(e?.message || "failed to load media"));
    }, []);

    const available = (media ?? []).filter((m) => !existing.includes(m.name));

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

                <div className="add-media-footer">
                    <button className="add-media-close" onClick={onClose}>close</button>
                </div>
            </div>
        </div>
    );
};

export default AddMediaDialog;
