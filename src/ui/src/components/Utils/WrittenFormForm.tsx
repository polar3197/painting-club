import { useState, useRef, useEffect } from "react";
import { WrittenFormOut } from "../../api";

const ACCEPTED = ".pdf,.txt,.docx,.md";
const PREVIEW_LINES = 14;
const TEXT_EXTS = new Set(["txt", "md"]);

function detectExt(name: string): string {
    const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : "";
}

type Mode = "file" | "text";

const WrittenFormForm = ({ onDataChange, initialData }: { onDataChange: (data: Record<string, any>) => void; initialData?: WrittenFormOut }) => {
    const [mode, setMode] = useState<Mode>("file");
    const [form, setForm] = useState<{
        title: string;
        date: string;
        keywords: string;
        series: string;
        comments_enabled: boolean;
        files: File | null;
        text: string;
    }>({
        title: initialData?.title ?? "",
        date: initialData?.date ?? "",
        keywords: initialData?.keywords?.join(", ") ?? "",
        series: initialData?.series_name ?? "",
        comments_enabled: initialData?.comments_enabled ?? false,
        files: null,
        text: "",
    });
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [snippet, setSnippet] = useState<string | null>(null);

    const update = (patch: Record<string, any>) => {
        const next = { ...form, ...patch };
        setForm(next);
        onDataChange(next);
    };

    // Reset the side that isn't active so AddArtDialog never reads stale data
    // from the inactive mode (we already do that on submit, but this keeps the
    // payload preview honest while typing).
    const pickMode = (next: Mode) => {
        if (next === mode) return;
        setMode(next);
        if (next === "file") update({ text: "" });
        else update({ files: null });
    };

    useEffect(() => {
        if (!form.files) { setSnippet(null); return; }
        const ext = detectExt(form.files.name);
        if (!TEXT_EXTS.has(ext)) { setSnippet(null); return; }
        let cancelled = false;
        form.files.text()
            .then(t => {
                if (cancelled) return;
                setSnippet(t.split(/\r?\n/).slice(0, PREVIEW_LINES).join("\n"));
            })
            .catch(() => { if (!cancelled) setSnippet(null); });
        return () => { cancelled = true; };
    }, [form.files]);

    const fileExt = form.files ? detectExt(form.files.name).toUpperCase() : "";

    return (
        <div className="written-form-form">
        <div className="written-form-frame">
            <div className="written-form-mode-tabs">
                <button
                    type="button"
                    className={`written-form-mode-tab${mode === "file" ? " active" : ""}`}
                    onClick={() => pickMode("file")}
                >
                    upload .txt
                </button>
                <button
                    type="button"
                    className={`written-form-mode-tab${mode === "text" ? " active" : ""}`}
                    onClick={() => pickMode("text")}
                >
                    paste text
                </button>
            </div>
            {mode === "file" ? (
                <div className="written-form-dropbox" onClick={() => fileInputRef.current?.click()}>
                    <input
                        type="file"
                        ref={fileInputRef}
                        style={{ display: "none" }}
                        accept={ACCEPTED}
                        onChange={(e) => update({ files: e.target.files?.[0] ?? null })}
                    />
                    {form.files ? (
                        <div className="written-form-preview">
                            <div className="written-form-badge">{fileExt}</div>
                            {snippet ? (
                                <pre className="written-form-preview-snippet">{snippet}</pre>
                            ) : (
                                <div className="written-form-filename">{form.files.name}</div>
                            )}
                        </div>
                    ) : (
                        "drop your writing here"
                    )}
                </div>
            ) : (
                <textarea
                    className="written-form-dropbox written-form-textarea"
                    value={form.text}
                    placeholder="paste your text here"
                    onChange={(e) => update({ text: e.target.value })}
                />
            )}
        </div>
        <div className="painting-title">
            <input
                value={form.title}
                placeholder="title *"
                onChange={(e) => update({ title: e.target.value })}
            />
        </div>
        <div className="painting-date">
            <input
                type="date"
                value={form.date}
                placeholder="date"
                onChange={(e) => update({ date: e.target.value })}
            />
        </div>
        <div className="keywords">
            <input
                value={form.keywords}
                placeholder="keywords"
                onChange={(e) => update({ keywords: e.target.value })}
            />
        </div>
        <div className="written-form-collection-field">
            <input
                value={form.series}
                placeholder="series (optional)"
                onChange={(e) => update({ series: e.target.value })}
            />
        </div>
        <div className="painting-comments-toggle">
            <label htmlFor="comments-toggle">comments</label>
            <input
                id="comments-toggle"
                type="checkbox"
                checked={form.comments_enabled}
                onChange={(e) => update({ comments_enabled: e.target.checked })}
            />
            <div className="toggle-track" onClick={() => update({ comments_enabled: !form.comments_enabled })}>
                <div className="toggle-thumb" />
            </div>
        </div>
        </div>
    );
};

export default WrittenFormForm;
