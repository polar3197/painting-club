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
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => {
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
                <div className="card-back">
                    {isOwner && onChangePic && (
                        <>
                            <button
                                className="change-pic-btn"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    fileInputRef.current?.click();
                                }}
                            >
                                change pic
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/png,image/jpeg,image/heic,image/heif,.heic,.heif"
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
