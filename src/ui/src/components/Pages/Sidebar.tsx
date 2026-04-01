import "../../styles/sidebar.css";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

interface SidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
}

const Sidebar = ({ isOpen, toggleSidebar }: SidebarProps) => {
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth()!; 
  console.log("CU: ", currentUser);
  
  const gotoMe = () => {
    navigate(`/members/${currentUser}/profile`);
  };

  const gotoProfiles = () => {
    console.log("go to profiles");
    navigate(`/members`);
  };

  const gotoGroups = () => {
    console.log("go to groups");
  };

  const gotoDocs = () => {
    navigate("/ethos");
  };

  const gotoLogout = () => {
    logout(); // removes token from sessionStorage
    navigate("/landing-page");
  }

  return (
    <div className={`sidebar ${isOpen ? "open" : "closed"}`}>
      <div className="sidebar-top">
        <div className={`sidebar-title ${isOpen ? "open" : "closed"}`}
          onClick={toggleSidebar}
        >
          {isOpen ?
            "-• Painting Club •-"
            : "PC"}
        </div>
        <div className={`sidebar-element ${isOpen ? "open" : "closed"}`}>
          {isOpen ? 
            <button onClick={gotoMe}>Me</button> 
            : <button onClick={gotoMe}>
                <img src={"/imgs/me.png"} width="100%" height="100%"></img>
              </button>}
        </div>
        <div className={`sidebar-element ${isOpen ? "open" : "closed"}`}>
          {isOpen ? 
            <button onClick={gotoProfiles}>Profiles</button> 
            : <button onClick={gotoProfiles}>
                <img src={"/imgs/profiles.png"} width="100%" height="100%"></img>
              </button>}
        </div>
        <div className={`sidebar-element ${isOpen ? "open" : "closed"}`}>
          {isOpen ? 
            <button onClick={gotoGroups}>Groups</button> 
            : <button onClick={gotoGroups}>
                <img src={"/imgs/groups.png"} width="100%" height="100%"></img>
              </button>}
        </div>
      </div>
      <div className="sidebar-bottom">
        <div className={`sidebar-element docs ${isOpen ? "open" : "closed"}`}>
          {isOpen ? 
            <button onClick={gotoDocs}>Docs</button> 
            : <button onClick={gotoDocs}>¶</button>}
        </div>
        <div className={`sidebar-element logout ${isOpen ? "open" : "closed"}`}>
          {isOpen ? 
            <button onClick={gotoLogout}>Logout</button> 
            : <button onClick={gotoLogout}>≤</button>}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
