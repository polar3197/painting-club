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
                        Painting Club is built and maintained by one person. If something is broken, confusing,
                        or missing — please reach out and I'll get back to you as soon as I can.
                    </p>
                    <br />

                    <p><b>Contact</b></p>
                    <br />
                    <p>
                        Email <a href="mailto:charlie@cooper.nu">charlie@cooper.nu</a> with:
                    </p>
                    <ul style={{ padding: "5px 0px 0px 30px" }}>
                        <li>Bug reports (what you did, what happened, what you expected)</li>
                        <li>Account issues — lost password, can't log in, want your account deleted</li>
                        <li>Questions about how something works</li>
                        <li>Feature suggestions</li>
                        <li>Anything else</li>
                    </ul>
                    <br />

                    <p><b>Response time</b></p>
                    <br />
                    <p>
                        Usually within a few days. I read every message.
                    </p>
                    <br />

                    <p><b>Deleting your account</b></p>
                    <br />
                    <p>
                        Email me from the address on file and I'll delete your account and all associated content
                        within 30 days.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Support;
