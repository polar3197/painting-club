import { Dispatch, SetStateAction, useRef, useState } from "react";
import "../../styles/utils/dialog.css";

const ArtZoomIn = ({
    isOwner,
    imgPath,
    setIsZoomedIn,
    onChangePic,
}: {
    isOwner: boolean;
    imgPath: string;
    setIsZoomedIn: Dispatch<SetStateAction<boolean>>;
    onChangePic?: (file: File) => Promise<void> | void;
}) => {

    const [flip, setFlip] = useState<"idle" | "flip" | "unflip">("idle");
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !onChangePic) return;
        await onChangePic(file);
        setIsZoomedIn(false);
    };

    return (
        <div className="blowup-backdrop" onClick={() => setIsZoomedIn(false)}>
        <div className="blowup-wrapper">
            <div className={`blowup-dialog ${flip === "flip" ? "flip" : ""}`}
                onClick={(e) => {
                    e.stopPropagation();
                    setFlip(flip === "flip" ? "unflip" : "flip");
                }}
            >
                <div className="card-front">
                    <img
                        src={imgPath}
                        alt={"no image"}
                    />
                </div>
                <div className="card-back" onClick={e => e.stopPropagation()}>
                    {isOwner && onChangePic && (
                        <>
                            <button
                                className="change-pic-btn"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                change pic
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/png,image/jpeg"
                                style={{ display: "none" }}
                                onChange={handleFile}
                            />
                        </>
                    )}
                </div>
            </div>
        </div>
    </div>
    );
};

export default ArtZoomIn;
