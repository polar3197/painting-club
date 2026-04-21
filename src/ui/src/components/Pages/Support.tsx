import "../../styles/ethos/ethos.css";
import { useNavigate } from "react-router-dom";

const Support = () => {
    const navigate = useNavigate();

    return (
        <div className="ethos-wrapper">
            <div className="leave-ethos" onClick={() => navigate("/landing-page")}>
                <p>&lt;—</p>
            </div>
            <div className="ethos-page">
                <div className="ethos-title">Support</div>
                <div className="ethos-content">
                    <hr />
                    <br />
                    <p>
                        Painting Club is built and run by one person. If something is broken, confusing, or missing —
                        I want to hear about it.
                    </p>
                    <br />

                    <p><b>Inside the app</b></p>
                    <ul style={{ padding: "5px 0px 0px 30px" }}>
                        <li>You can edit or delete any art, comment, or profile field yourself.</li>
                        <li>Profile settings let you hide media types from your page.</li>
                    </ul>
                    <br />

                    <p><b>Getting in touch</b></p>
                    <p>
                        <a href="mailto:charliepolar17@gmail.com">charliepolar17@gmail.com</a>
                    </p>
                    <br />

                    <p><b>Deleting your account</b></p>
                    <p>
                        Send a note from the email on your account and I'll delete your account and everything
                        attached to it within 30 days.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Support;
