import { Dispatch, SetStateAction, useEffect } from "react";
import { extFromPath, isTextExt, useWrittenFormText } from "../../hooks/useWrittenFormText";
import "../../styles/utils/dialog.css";

const WrittenFormZoomIn = ({
    title,
    filePath,
    setIsZoomedIn,
}: {
    title: string;
    filePath: string;
    setIsZoomedIn: Dispatch<SetStateAction<boolean>>;
}) => {
    const ext = extFromPath(filePath);
    const text = useWrittenFormText(filePath);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setIsZoomedIn(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [setIsZoomedIn]);

    const previewable = isTextExt(ext);

    return (
        <div className="blowup-backdrop" onClick={() => setIsZoomedIn(false)}>
            <div className="written-form-zoom-page" onClick={(e) => e.stopPropagation()}>
                {!previewable ? (
                    <div className="written-form-zoom-fallback">
                        <div className="written-form-zoom-fallback-badge">{ext.toUpperCase()}</div>
                        <div className="written-form-zoom-fallback-title">{title}</div>
                        <a
                            href={filePath}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="written-form-zoom-fallback-link"
                        >
                            open file
                        </a>
                    </div>
                ) : text == null ? (
                    <div className="written-form-zoom-loading">loading…</div>
                ) : (
                    <pre className="written-form-zoom-text">{text}</pre>
                )}
            </div>
        </div>
    );
};

export default WrittenFormZoomIn;
