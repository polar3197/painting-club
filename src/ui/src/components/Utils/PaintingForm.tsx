import { useState, useRef } from "react";

const PaintingForm = () => {
    const [form, setForm] = useState<{ title: string; location: string; date: string; song: string; feeling: string; files: File | null }>
        ({ title: "", location: "", date: "", song: "", feeling: "", files: null });
    const fileInputRef = useRef<HTMLInputElement>(null);

    return (
        <>
        <div className="painting-dropbox" onClick={() => fileInputRef.current?.click()}>
            <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                accept=".png, .jpg, .jpeg, .pdf"
                onChange={(e) => setForm(prev => ({...prev, files: (e.target.files?.[0] ?? null)}))}
                // onChange={}
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
                onChange={(e) => setForm(prev => ({...prev, title: e.target.value}))}
            />
        </div>
        <div className="painting-location">
            <input 
                value={form.location}
                placeholder="location"
                onChange={(e) => setForm(prev => ({...prev, location: e.target.value}))}
            />
        </div>
        <div className="painting-date">
            <input 
                value={form.date}
                placeholder="date"
                onChange={(e) => setForm(prev => ({...prev, date: e.target.value}))}
            />
        </div>
        <div className="painting-song">
            <input 
                value={form.song}
                placeholder="song"
                onChange={(e) => setForm(prev => ({...prev, song: e.target.value}))}
            />
        </div>
        <div className="painting-feeling">
            <input 
                value={form.feeling}
                placeholder="feeling"
                onChange={(e) => setForm(prev => ({...prev, feeling: e.target.value}))}
            />
        </div>
        </>
    );
};

export default PaintingForm;