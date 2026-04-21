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
                        Painting Club is a small, independent community for artists. We only collect what's needed
                        to run the app — no ads, no tracking, no selling data.
                    </p>
                    <br />

                    <p><b>What we collect</b></p>
                    <ul style={{ padding: "5px 0px 0px 30px" }}>
                        <li>Account info you provide (username, hashed password, profile details).</li>
                        <li>Content you upload (art, titles, keywords, comments).</li>
                        <li>Standard server logs for operating the service.</li>
                    </ul>
                    <br />

                    <p><b>What we don't do</b></p>
                    <ul style={{ padding: "5px 0px 0px 30px" }}>
                        <li>No analytics SDKs or cross-site tracking.</li>
                        <li>No advertising.</li>
                        <li>No sharing or selling your data to third parties.</li>
                    </ul>
                    <br />

                    <p><b>Your choices</b></p>
                    <ul style={{ padding: "5px 0px 0px 30px" }}>
                        <li>Edit or remove any of your content from inside the app.</li>
                        <li>Email us to delete your account and associated content.</li>
                        <li>Email us for a copy of your data.</li>
                    </ul>
                    <br />

                    <p><b>Contact</b></p>
                    <p>
                        <a href="mailto:charlie@cooper.nu">charlie@cooper.nu</a>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Privacy;
