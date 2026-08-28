import ApplicationForm from "./ApplicationForm";
import "../../styles/utils/dialog.css";
import "../../styles/utils/application-dialog.css";

const ApplicationDialog = ({ onClose }: { onClose: () => void }) => {
    return (
        <div className="dialog application-dialog">
            <div className="exit">
                <button onClick={onClose}>x</button>
            </div>
            <ApplicationForm />
        </div>
    );
};

export default ApplicationDialog;
