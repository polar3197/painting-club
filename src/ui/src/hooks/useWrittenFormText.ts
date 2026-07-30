import { useEffect, useState } from "react";

const TEXT_EXTS = new Set(["txt", "md"]);

export function extFromPath(path: string): string {
    // file_path now arrives signed (`...abc.txt?md5=…&expires=…`) — drop the
    // query/hash first or the extension never matches and every written piece
    // falls back to "open file".
    const clean = path.split(/[?#]/)[0].toLowerCase();
    const m = clean.match(/\.([a-z0-9]+)$/);
    return m ? m[1] : "";
}

export function isTextExt(ext: string): boolean {
    return TEXT_EXTS.has(ext);
}

/** Fetch a written-form file's text content. Returns null for non-text extensions
 *  and while the fetch is in flight; returns "" if the file is empty. */
export function useWrittenFormText(filePath: string): string | null {
    const [text, setText] = useState<string | null>(null);
    const ext = extFromPath(filePath);

    useEffect(() => {
        if (!isTextExt(ext)) {
            setText(null);
            return;
        }
        let cancelled = false;
        fetch(filePath)
            .then(r => r.ok ? r.text() : Promise.reject(new Error(`${r.status}`)))
            .then(t => { if (!cancelled) setText(t); })
            .catch(() => { if (!cancelled) setText(null); });
        return () => { cancelled = true; };
    }, [filePath, ext]);

    return text;
}
