import { Dispatch, SetStateAction } from "react";                                                                                 
import "../../styles/utils/dialog.css";                                                                                                     
                                                                                                                                            
const ArtZoomIn = ({ imgPath, setIsZoomedIn }: { imgPath: string, setIsZoomedIn: Dispatch<SetStateAction<boolean>> }) => {                                                                                                                                                              
    return (
        <div className="blowup-backdrop" onClick={() => setIsZoomedIn(false)}>
            <div className="blowup-dialog" onClick={(e) => e.stopPropagation()}>                                      
                <img                                                                                                                        
                    src={imgPath}                                                                                                           
                    alt={"no image"}                                                                                                        
                />
            </div>
        </div>                                                                                                                              
    );
};                                                                                                                                          
                
export default ArtZoomIn;