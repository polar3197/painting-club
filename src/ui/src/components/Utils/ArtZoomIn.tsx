import { Dispatch, SetStateAction, useState } from "react";                                                                                 
import "../../styles/utils/dialog.css";                                                                                                     
                                                                                                                                            
const ArtZoomIn = ({ isOwner, imgPath, setIsZoomedIn }: { isOwner: boolean; imgPath: string, setIsZoomedIn: Dispatch<SetStateAction<boolean>> }) => {       
    
    const [flip, setFlip] = useState<"idle" | "flip" | "unflip">("idle"); 
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
                <div className="card-back">
                    {/* comments */}
                </div>
            </div>
        </div>
    </div>                                                                                                        
    );
};                                                                                                                                          
                
export default ArtZoomIn;