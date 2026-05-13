import { Dispatch, SetStateAction, useEffect, useMemo, useState } from "react";
import { extFromPath, isTextExt, useWrittenFormText } from "../../hooks/useWrittenFormText";
import "../../styles/utils/dialog.css";

const LINES_PER_PAGE = 38;

function paginate(text: string, perPage: number): string[] {
    const lines = text.split(/\r?\n/);
    const pages: string[] = [];
    for (let i = 0; i < lines.length; i += perPage) {
        pages.push(lines.slice(i, i + perPage).join("\n"));
    }
    return pages.length > 0 ? pages : [""];
}

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
    const [pageIdx, setPageIdx] = useState(0);

    const pages = useMemo(() => (text != null ? paginate(text, LINES_PER_PAGE) : []), [text]);
    const totalPages = pages.length;

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setIsZoomedIn(false);
            else if (e.key === "ArrowRight") setPageIdx(i => Math.min(i + 1, totalPages - 1));
            else if (e.key === "ArrowLeft") setPageIdx(i => Math.max(i - 1, 0));
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [setIsZoomedIn, totalPages]);

    const advance = () => {
        if (totalPages === 0) return;
        setPageIdx(i => (i + 1) % totalPages);
    };

    const previewable = isTextExt(ext);

    return (
        <div className="blowup-backdrop" onClick={() => setIsZoomedIn(false)}>
            <div className="written-form-zoom-wrapper" onClick={(e) => e.stopPropagation()}>
                <div className="written-form-zoom-page" onClick={advance}>
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
                        <pre className="written-form-zoom-text">{pages[pageIdx] ?? ""}</pre>
                    )}
                </div>
                {previewable && totalPages > 1 && (
                    <div className="written-form-zoom-footer">
                        page {pageIdx + 1} / {totalPages}
                    </div>
                )}
            </div>
        </div>
    );
};

export default WrittenFormZoomIn;
