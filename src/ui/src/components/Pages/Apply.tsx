import { useNavigate } from "react-router-dom";
import ApplicationFlow from "../Utils/ApplicationFlow";

// The application as its own page. It used to open as an overlay on the
// landing page, and when the phone keyboard came up Safari scrolled the
// painting behind it into view. On its own route there's nothing behind it.
export default function Apply() {
  const navigate = useNavigate();
  const close = () => (window.history.length > 1 ? navigate(-1) : navigate("/landing-page"));
  return <ApplicationFlow onClose={close} />;
}
