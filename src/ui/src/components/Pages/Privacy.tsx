import "../../styles/ethos/ethos.css";
import { useNavigate } from "react-router-dom";

const Privacy = () => {
    const navigate = useNavigate();

    return (
        <div className="ethos-wrapper">
            <div className="leave-ethos" onClick={() => navigate("/landing-page")}>
                <p>&lt;—</p>
            </div>
            <div className="ethos-page">
                <div className="ethos-title">Privacy Policy</div>
                <div className="ethos-content">
                    <p style={{ color: "rgb(66,65,65)" }}><i>Effective: April 2026</i></p>
                    <hr />
                    <br />
                    <p>
                        Painting Club is a small thing I'm building solo. No ads, no tracking, no selling data.
                        I only keep what's needed to make the app work.
                    </p>
                    <br />

                    <p><b>What I keep</b></p>
                    <ul style={{ padding: "5px 0px 0px 30px" }}>
                        <li>Whatever you type into your account (username, hashed password, profile stuff).</li>
                        <li>Whatever you upload (art, titles, keywords, comments).</li>
                        <li>Basic server logs so I can keep the app running.</li>
                    </ul>
                    <br />

                    <p><b>What I don't do</b></p>
                    <ul style={{ padding: "5px 0px 0px 30px" }}>
                        <li>No analytics SDKs or cross-site tracking.</li>
                        <li>No advertising.</li>
                        <li>Not sharing or selling your data to anyone.</li>
                    </ul>
                    <br />

                    <p><b>Your choices</b></p>
                    <ul style={{ padding: "5px 0px 0px 30px" }}>
                        <li>Edit or delete anything you've posted from inside the app.</li>
                        <li>Want your account deleted, or a copy of your data? Head to the <a onClick={() => navigate("/support")} style={{ cursor: "pointer", textDecoration: "underline" }}>support page</a> and reach out.</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default Privacy;
