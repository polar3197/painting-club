import { useState, useRef, useEffect } from "react";
import heic2any from "heic2any";
import { Visual2DOut } from "../../api";

const PaintingForm = ({ onDataChange, initialData }: { onDataChange: (data: Record<string, any>) => void; initialData?: Visual2DOut }) => {
    const [form, setForm] = useState<{
        title: string;
        location: string;
        date: string;
        song: string;
        song_artist: string;
        width: number | null;
        height: number | null;
        keywords: string;
        comments_enabled: boolean;
        files: File | null; }>
        ({
            title: initialData?.title ?? "",
            location: initialData?.location ?? "",
            date: initialData?.date ?? "",
            song: initialData?.song ?? "",
            song_artist: initialData?.song_artist ?? "",
            width: initialData?.width ?? null,
            height: initialData?.height ?? null,
            keywords: initialData?.keywords?.join(", ") ?? "",
            comments_enabled: initialData?.comments_enabled ?? false,
            files: null,
        });
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    // Distinguishes "still converting HEIC" from "finished but no preview available":
    // both have previewUrl=null, but the user shouldn't see "converting..." forever
    // if heic2any failed or returned an unrenderable blob.
    const [converting, setConverting] = useState(false);

    const update = (patch: Record<string, any>) => {
        const next = { ...form, ...patch };
        setForm(next);
        onDataChange(next);
    };

    useEffect(() => {
        return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
    }, [previewUrl]);

    const handleFileChange = async (file: File | null) => {
        update({ files: file });
        if (!file) {
            setPreviewUrl(null);
            setConverting(false);
            return;
        }
        const isHeic = /\.(heic|heif)$/i.test(file.name)
            || file.type === "image/heic"
            || file.type === "image/heif";
        if (isHeic) {
            setConverting(true);
            setPreviewUrl(null);
            try {
                const result = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
                const blob = Array.isArray(result) ? result[0] : result;
                setPreviewUrl(URL.createObjectURL(blob as Blob));
            } catch {
                setPreviewUrl(null);
            } finally {
                setConverting(false);
            }
        } else {
            setConverting(false);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    return (
        <>
        <div className="painting-dropbox" onClick={() => fileInputRef.current?.click()}>
            <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                accept=".png, .jpg, .jpeg, .pdf, .heic, .heif"
                onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            />
            {form.files && previewUrl ?
                <img src={previewUrl} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                : form.files && converting ?
                    "converting preview..."
                    : form.files ?
                        form.files.name
                        : "drop your art here"
            }
        </div>
        <div className="painting-title">
            <input
                value={form.title}
                placeholder="title *"
                onChange={(e) => update({ title: e.target.value })}
            />
        </div>
        <div className="painting-location">
            <input
                value={form.location}
                placeholder="location"
                onChange={(e) => update({ location: e.target.value })}
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
        <div className="painting-song">
            <input
                value={form.song}
                placeholder="song"
                onChange={(e) => update({ song: e.target.value })}
            />
            <input
                value={form.song_artist}
                placeholder="artist"
                onChange={(e) => update({ song_artist: e.target.value })}
            />
        </div>
        <div className="painting-width">
            <input
                type="number"
                value={form.width ?? ""}
                min={0}
                step={1}
                placeholder="width"
                onChange={(e) => update({ width: e.target.value ? Number(e.target.value) : null })}
            />
        </div>
        <div className="painting-height">
            <input
                type="number"
                value={form.height ?? ""}
                min={0}
                step={1}
                placeholder="height"
                onChange={(e) => update({ height: e.target.value ? Number(e.target.value) : null })}
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

export default PaintingForm;