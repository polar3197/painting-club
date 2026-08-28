import "../../styles/sidebar.css";
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

interface SidebarProps {
  isOpen: boolean;
}

const SidebarElement = ({
  isOpen,
  label,
  imgSrc,
  extraClass,
  onClick,
  children,
}: {
  isOpen: boolean;
  label: string;
  imgSrc?: string;
  extraClass?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className={`sidebar-element ${extraClass ?? ""} ${isOpen ? "open" : "closed"}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button onClick={onClick}>{children}</button>
      {hovered && !isOpen && (
        <div className="sidebar-tooltip">
          {imgSrc && <img src={imgSrc} alt={label} />}
          <span>{label}</span>
        </div>
      )}
    </div>
  );
};

const Sidebar = ({ isOpen }: SidebarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, currentRole, logout } = useAuth()!;
  console.log("CU: ", currentUser);

  const gotoHome = () => {
    navigate("/home");
  };

  const gotoMe = () => {
    if (currentUser) {
      const target = `/members/${currentUser}/profile`;
      if (location.pathname === target) {
        document.getElementById("page-body")?.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        navigate(target);
      }
    } else {
      navigate("/not-a-member");
    }
  };

  const gotoProfiles = () => {
    console.log("go to profiles");
    navigate(`/members`);
  };

  // const gotoGroups = () => {
  //   console.log("go to groups");
  // };

  const gotoArt = () => {
    navigate("/art");
  };

  const gotoDocs = () => {
    navigate("/ethos");
  };

  const gotoLogout = () => {
    logout(); // removes token from localStorage
    navigate("/landing-page");
  }

  return (
    <div className={`sidebar ${isOpen ? "open" : "closed"}`}>
      <div className="sidebar-top">
        <div className={`sidebar-title ${isOpen ? "open" : "closed"}`}
          onClick={gotoHome}
        >
          {isOpen ?
            "-• Painting Club •-"
            : "PC"}
        </div>
        <SidebarElement isOpen={isOpen} label="me" imgSrc="/imgs/me.png" onClick={gotoMe}>
          {isOpen ? "Me" : <img src="/imgs/me.png" width="100%" height="100%" />}
        </SidebarElement>
        <SidebarElement isOpen={isOpen} label="people" imgSrc="/imgs/profiles.png" onClick={gotoProfiles}>
          {isOpen ? "People" : <img src="/imgs/profiles.png" width="100%" height="100%" />}
        </SidebarElement>
        <SidebarElement isOpen={isOpen} label="art" imgSrc="/imgs/art.png" onClick={gotoArt}>
          {isOpen ? "Art" : <img src="/imgs/art.png" width="100%" height="100%" />}
        </SidebarElement>
        {currentRole === "admin" && (
          <SidebarElement isOpen={isOpen} label="admin" onClick={() => navigate("/admin")}>
            {isOpen ? "Admin" : "★"}
          </SidebarElement>
        )}
      </div>
      <div className="sidebar-bottom">
        <SidebarElement isOpen={isOpen} label="ethos" extraClass="docs" onClick={gotoDocs}>
          {isOpen ? "Docs" : "¶"}
        </SidebarElement>
        <SidebarElement isOpen={isOpen} label="logout" extraClass="logout" onClick={gotoLogout}>
          {isOpen ? "Logout" : "≤"}
        </SidebarElement>
      </div>
    </div>
  );
};

export default Sidebar;
