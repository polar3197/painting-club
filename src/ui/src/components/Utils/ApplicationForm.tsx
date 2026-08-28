import { useState } from "react";
import { submit_application } from "../../api";
import "../../styles/utils/application-dialog.css";

// Shared request-account form. Used both inside ApplicationDialog (overlay on
// the landing page) and as the body of the standalone /join page. Keeping the
// fields + submit logic here means the two entry points never drift.
//
// A real <form>: Enter submits, the submit control is a focusable <button>,
// and the input types/autocomplete hints give phones the right keyboard and
// autofill — this is mostly filled in from a flyer QR on a phone.
const ApplicationForm = ({ onSubmitted }: { onSubmitted?: () => void }) => {
    const [form, setForm] = useState({
        firstname: "",
        lastname: "",
        email: "",
        city: "",
        state: "",
        known_member: "",
        reason: "",
    });
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const update = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting) return;
        if (!form.firstname.trim() || !form.lastname.trim() || !form.email.trim()) {
            setError("First name, last name, and email are required.");
            return;
        }
        setError(null);
        setSubmitting(true);
        try {
            await submit_application({
                firstname: form.firstname.trim(),
                lastname: form.lastname.trim(),
                email: form.email.trim(),
                city: form.city.trim() || undefined,
                state: form.state.trim() || undefined,
                known_member: form.known_member.trim() || undefined,
                reason: form.reason.trim() || undefined,
            });
            setSubmitted(true);
            onSubmitted?.();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setSubmitting(false);
        }
    };

    if (submitted) {
        return (
            <div className="application-submitted">
                <p>Your request is in.</p>
                <p className="application-submitted-sub">
                    Every application is read by a person. You'll hear from us by email.
                </p>
            </div>
        );
    }

    // noValidate: keep the styled error line instead of the browser's native
    // popovers, which render inconsistently on mobile.
    return (
        <form className="application-body" onSubmit={handleSubmit} noValidate>
            <h2 className="application-title">request an account</h2>
            <div className="application-row">
                <input
                    placeholder="first name *"
                    autoComplete="given-name"
                    value={form.firstname}
                    onChange={e => update({ firstname: e.target.value })}
                />
                <input
                    placeholder="last name *"
                    autoComplete="family-name"
                    value={form.lastname}
                    onChange={e => update({ lastname: e.target.value })}
                />
            </div>
            <input
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                placeholder="email *"
                value={form.email}
                onChange={e => update({ email: e.target.value })}
            />
            <div className="application-row">
                <input
                    placeholder="city"
                    autoComplete="address-level2"
                    value={form.city}
                    onChange={e => update({ city: e.target.value })}
                />
                <input
                    placeholder="state"
                    autoComplete="address-level1"
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
            <button type="submit" className="application-submit" disabled={submitting}>
                {submitting ? "sending…" : "submit"}
            </button>
        </form>
    );
};

export default ApplicationForm;
