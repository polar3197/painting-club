import { useState, useRef } from "react";
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
            files: null,
        });
    const fileInputRef = useRef<HTMLInputElement>(null);

    const update = (patch: Record<string, any>) => {
        const next = { ...form, ...patch };
        setForm(next);
        onDataChange(next);
    };

    return (
        <>
        <div className="painting-dropbox" onClick={() => fileInputRef.current?.click()}>
            <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                accept=".png, .jpg, .jpeg, .pdf"
                onChange={(e) => update({ files: e.target.files?.[0] ?? null })}
            />
            {form.files ?
                <img src={URL.createObjectURL(form.files)} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                : "drop your art here"
            }
        </div>
        <div className="painting-title">
            <input
                value={form.title}
                placeholder="title"
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
        </>
    );
};

export default PaintingForm;