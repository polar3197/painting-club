
import Sidebar from "./Sidebar";
import { useState } from "react";
import { Outlet } from "react-router-dom";
import "../../styles/page-layout.css";

const PageLayout = () => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleSidebar = () => setIsOpen(!isOpen);

  return (
    <div className="page-wrapper">
        <Sidebar isOpen={isOpen} toggleSidebar={toggleSidebar} />
        <div className="page-body">
            <Outlet />
        </div>
    </div>
  );
};

export default PageLayout;