import { useNavigate } from "react-router-dom";
import "../../styles/not-member.css";

const NotMember = () => {
    const navigate = useNavigate();

    return (
        <>
        <div className="not-member-wrapper">
            <div className="not-member-card">
                <p className="not-member-heading">you aren't a member</p>
                <p className="not-member-sub">would you like to request an account?</p>
                <div className="not-member-actions">
                    <div className="not-member-btn" onClick={() => navigate("/apply")}>
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
