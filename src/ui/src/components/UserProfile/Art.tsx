import '../../styles/user-profile/art.css';
import { Profile } from "../../api";

const Art = ({ profile, selectedMedium } : { profile: Profile; selectedMedium: string | null }) => {
    return (
        <div className='art'>
            {selectedMedium} is empty atm
        </div>
    );
};

export default Art;