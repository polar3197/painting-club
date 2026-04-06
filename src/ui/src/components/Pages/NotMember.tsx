import { useState } from "react";
import { useNavigate } from "react-router-dom";
import ApplicationDialog from "../Utils/ApplicationDialog";
import "../../styles/not-member.css";

const NotMember = () => {
    const navigate = useNavigate();
    const [showApplication, setShowApplication] = useState(false);

    return (
        <>
        {showApplication && <ApplicationDialog onClose={() => setShowApplication(false)} />}
        <div className="not-member-wrapper">
            <div className="not-member-card">
                <p className="not-member-heading">you aren't a member</p>
                <p className="not-member-sub">would you like to request an account?</p>
                <div className="not-member-actions">
                    <div className="not-member-btn" onClick={() => setShowApplication(true)}>
                        request access
                    </div>
                    <div className="not-member-btn secondary" onClick={() => navigate("/landing-page")}>
                        login
                    </div>
                </div>
            </div>
        </div>
        </>
    );
};

export default NotMember;
