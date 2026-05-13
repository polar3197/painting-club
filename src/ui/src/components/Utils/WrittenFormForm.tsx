import { useState, useRef } from "react";
import { WrittenFormOut } from "../../api";

const ACCEPTED = ".pdf,.txt,.docx,.md";

function detectExt(name: string): string {
    const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : "";
}

const WrittenFormForm = ({ onDataChange, initialData }: { onDataChange: (data: Record<string, any>) => void; initialData?: WrittenFormOut }) => {
    const [form, setForm] = useState<{
        title: string;
        date: string;
        keywords: string;
        comments_enabled: boolean;
        files: File | null; }>
        ({
            title: initialData?.title ?? "",
            date: initialData?.date ?? "",
            keywords: initialData?.keywords?.join(", ") ?? "",
            comments_enabled: initialData?.comments_enabled ?? false,
            files: null,
        });
    const fileInputRef = useRef<HTMLInputElement>(null);

    const update = (patch: Record<string, any>) => {
        const next = { ...form, ...patch };
        setForm(next);
        onDataChange(next);
    };

    const handleFileChange = (file: File | null) => {
        update({ files: file });
    };

    const fileExt = form.files ? detectExt(form.files.name).toUpperCase() : "";

    return (
        <>
        <div className="written-form-dropbox" onClick={() => fileInputRef.current?.click()}>
            <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                accept={ACCEPTED}
                onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            />
            {form.files ? (
                <div className="written-form-preview">
                    <div className="written-form-badge">{fileExt}</div>
                    <div className="written-form-filename">{form.files.name}</div>
                </div>
            ) : (
                "drop your writing here"
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
        </>
    );
};

export default WrittenFormForm;
