import { Outlet } from "react-router-dom";
import TabBar from "./TabBar";
import "../../styles/page-layout.css";

// Every signed-in page: the page, and the bottom tab bar (profile / events /
// art wall / people). The old sidebar and the swipe hub live in ui/legacy/.
const PageLayout = () => (
  <div className="page-wrapper">
    <div id="page-body" className="page-body">
      <Outlet />
    </div>
    <TabBar />
  </div>
);

export default PageLayout;
