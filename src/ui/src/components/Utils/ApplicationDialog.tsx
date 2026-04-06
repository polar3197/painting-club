import { useState } from "react";
import { submit_application } from "../../api";
import "../../styles/utils/dialog.css";
import "../../styles/utils/application-dialog.css";

const ApplicationDialog = ({ onClose }: { onClose: () => void }) => {
    const [form, setForm] = useState({
        firstname: "",
        lastname: "",
        email: "",
        city: "",
        state: "",
        known_member: "",
        reason: "",
    });
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const update = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }));

    const handleSubmit = async () => {
        if (!form.firstname || !form.lastname || !form.email) {
            setError("First name, last name, and email are required.");
            return;
        }
        try {
            await submit_application({
                firstname: form.firstname,
                lastname: form.lastname,
                email: form.email,
                city: form.city || undefined,
                state: form.state || undefined,
                known_member: form.known_member || undefined,
                reason: form.reason || undefined,
            });
            setSubmitted(true);
        } catch (e) {
            setError((e as Error).message);
        }
    };

    return (
        <div className="dialog application-dialog">
            <div className="exit">
                <button onClick={onClose}>x</button>
            </div>
            {submitted ? (
                <div className="application-submitted">
                    <p>Your request has been submitted.</p>
                    <p>We'll be in touch soon.</p>
                </div>
            ) : (
                <div className="application-body">
                    <h2 className="application-title">request an account</h2>
                    <div className="application-row">
                        <input
                            placeholder="first name *"
                            value={form.firstname}
                            onChange={e => update({ firstname: e.target.value })}
                        />
                        <input
                            placeholder="last name *"
                            value={form.lastname}
                            onChange={e => update({ lastname: e.target.value })}
                        />
                    </div>
                    <input
                        placeholder="email *"
                        value={form.email}
                        onChange={e => update({ email: e.target.value })}
                    />
                    <div className="application-row">
                        <input
                            placeholder="city"
                            value={form.city}
                            onChange={e => update({ city: e.target.value })}
                        />
                        <input
                            placeholder="state"
                            value={form.state}
                            onChange={e => update({ state: e.target.value })}
                        />
                    </div>
                    <input
                        placeholder="do you know a current member? (optional)"
                        value={form.known_member}
                        onChange={e => update({ known_member: e.target.value })}
                    />
                    <textarea
                        placeholder="why do you want an account?"
                        rows={5}
                        value={form.reason}
                        onChange={e => update({ reason: e.target.value })}
                    />
                    {error && <p className="application-error">{error}</p>}
                    <div className="application-submit" onClick={handleSubmit}>
                        submit
                    </div>
                </div>
            )}
        </div>
    );
};

export default ApplicationDialog;
