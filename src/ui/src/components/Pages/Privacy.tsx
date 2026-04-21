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
                        to run the app. We don't sell your data. We don't run ads. We don't track you across the
                        internet. This policy explains what we do collect and why.
                    </p>
                    <br />

                    <p><b>What we collect</b></p>
                    <br />
                    <ul style={{ padding: "5px 0px 0px 30px" }}>
                        <li><b>Account info</b> — username, password (stored hashed), email if provided, profile picture, bio, location you choose to share.</li>
                        <li><b>Content you upload</b> — art pieces, titles, dates, keywords, comments, and any metadata you attach to your work.</li>
                        <li><b>Basic technical logs</b> — standard server logs (IP address, request time, response code) used to operate the service and protect against abuse. Rotated out after a short period.</li>
                    </ul>
                    <br />

                    <p><b>What we don't collect</b></p>
                    <br />
                    <ul style={{ padding: "5px 0px 0px 30px" }}>
                        <li>No analytics SDKs, no cross-site tracking, no behavioral profiling.</li>
                        <li>No advertising networks.</li>
                        <li>No location beyond what you type into your profile.</li>
                        <li>No contacts, photos library, calendar, or microphone access (unless you explicitly grant it for uploading).</li>
                    </ul>
                    <br />

                    <p><b>How we use your data</b></p>
                    <br />
                    <ul style={{ padding: "5px 0px 0px 30px" }}>
                        <li>To show your profile and art to other members you've chosen to share with.</li>
                        <li>To authenticate you and keep your account secure.</li>
                        <li>To respond if you contact us for support.</li>
                    </ul>
                    <br />

                    <p><b>Who sees your data</b></p>
                    <br />
                    <p>
                        Other members see the content you publish. That's it. We don't sell, rent, or share your data
                        with third parties. The only exception is if compelled by a valid legal request — in which
                        case we disclose the minimum required and, where lawful, notify you.
                    </p>
                    <br />

                    <p><b>Where your data lives</b></p>
                    <br />
                    <p>
                        Your account data and uploaded content are stored on servers we operate. Passwords are hashed;
                        we never see your plaintext password. Uploaded files are stored alongside the account that
                        uploaded them.
                    </p>
                    <br />

                    <p><b>Your choices</b></p>
                    <br />
                    <ul style={{ padding: "5px 0px 0px 30px" }}>
                        <li><b>Edit or delete content</b> — you can remove any art piece, comment, or profile field at any time from within the app.</li>
                        <li><b>Delete your account</b> — email us and we'll delete your account and associated content within 30 days.</li>
                        <li><b>Access a copy of your data</b> — email us and we'll send you a copy of what's attached to your account.</li>
                    </ul>
                    <br />

                    <p><b>Children</b></p>
                    <br />
                    <p>
                        Painting Club is not directed at children under 13. If you believe a child has created an
                        account, contact us and we'll remove it.
                    </p>
                    <br />

                    <p><b>Changes to this policy</b></p>
                    <br />
                    <p>
                        If we meaningfully change how we handle your data, we'll update this page and note the new
                        effective date at the top. Continued use after a change means you accept the updated policy.
                    </p>
                    <br />

                    <p><b>Contact</b></p>
                    <br />
                    <p>
                        Questions, deletion requests, or anything else: <a href="mailto:charlie@cooper.nu">charlie@cooper.nu</a>.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Privacy;
