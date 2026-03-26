
import { useState } from "react";
import { Profile } from "../../api";
import AddArtDialog from "../Utils/AddArtDialog";

import '../../styles/user-profile/art.css';

const Art = ({ profile, selectedMedium } : { profile: Profile; selectedMedium: string | null; }) => {
    const [showDialog, setShowDialog] = useState(false);

    return (
        <div className='art-wrapper'>
            {profile.is_owner && 
                <div className="add">
                    <button onClick={() => setShowDialog(true)}>+</button>
                </div>
            }
            { showDialog && 
                <AddArtDialog 
                    setShowDialog={setShowDialog} 
                    selectedMedium={selectedMedium}
                />
            }
            <div className="art">
                {selectedMedium} is empty atm
            </div>
        </div>
    );
};

export default Art;