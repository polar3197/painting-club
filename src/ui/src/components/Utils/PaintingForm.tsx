import { useState, useRef } from "react";

const PaintingForm = ({ onDataChange }: { onDataChange: (data: Record<string, any>) => void }) => {
    const [form, setForm] = useState<{ title: string; location: string; date: string; song: string; width: number; height: number; files: File | null; }>
        ({ title: "", location: "", date: "", song: "", width: null, height: null, files: null });
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
                : "drop a painting"
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
        </>
    );
};

export default PaintingForm;