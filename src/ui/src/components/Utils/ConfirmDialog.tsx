import "../../styles/utils/confirm-dialog.css";

const ConfirmDialog = (
    {
        message = "u sure?",
        confirmLabel = "yes",
        cancelLabel = "no. shit. stop",
        onConfirm,
        onCancel,
    }
    :
    {
        message?: string;
        confirmLabel?: string;
        cancelLabel?: string;
        onConfirm: () => void;
        onCancel: () => void;
    }
) => {
    return (
        <div className="confirm-backdrop" onClick={onCancel}>
            <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
                <div className="confirm-message">{message}</div>
                <div className="confirm-buttons">
                    <button className="confirm-no" onClick={onCancel}>{cancelLabel}</button>
                    <button className="confirm-yes" onClick={onConfirm}>{confirmLabel}</button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmDialog;
