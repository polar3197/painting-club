
import Sidebar from "./Sidebar";
import { useState } from "react";
import { Outlet } from "react-router-dom";
import "../../styles/page-layout.css";

const PageLayout = () => {
  const [isOpen] = useState(false);

  return (
    <div className="page-wrapper">
        <Sidebar isOpen={isOpen} />
        <div id="page-body" className="page-body">
            <Outlet />
        </div>
    </div>
  );
};

export default PageLayout;