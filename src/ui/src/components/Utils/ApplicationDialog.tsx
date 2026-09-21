import ApplicationFlow from "./ApplicationFlow";

// "request acc" on the landing page. The application is the same full-screen
// flow the club QR leads to — one form everywhere, so the two entry points
// can't drift. It brings its own surface, so there's no dialog chrome here.
const ApplicationDialog = ({ onClose }: { onClose: () => void }) => (
    <ApplicationFlow onClose={onClose} />
);

export default ApplicationDialog;
