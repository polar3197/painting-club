import "../../styles/sidebar.css";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

interface SidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
}

const Sidebar = ({ isOpen, toggleSidebar }: SidebarProps) => {
  const navigate = useNavigate();
  const { currentUser } = useAuth()!; 
  console.log("CU: ", currentUser);
  
  const gotoMe = () => {
    navigate(`/members/${currentUser}/profile`);
  };

  const gotoProfiles = () => {
    console.log("go to profiles")
    navigate(`/members`);
  };

  const gotoGroups = () => {
    console.log("go to groups")
  };

  return (
    <div className={`sidebar ${isOpen ? "open" : "closed"}`}>
      <div className={`sidebar-title ${isOpen ? "open" : "closed"}`}>
        {isOpen ?
          "-• Painting Club •-"
          : "PC"}
      </div>
      <div
        className={`sidebar-toggle ${isOpen ? "open" : "closed"}`}
        onClick={toggleSidebar}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggleSidebar()}
      >
        <p>~</p>
      </div>
      <div className={`sidebar-element ${isOpen ? "open" : "closed"}`}>
        {isOpen ? 
          <button onClick={gotoMe}>Me</button> 
          : <button onClick={gotoMe}>&#10038;</button>}
      </div>
      <div className={`sidebar-element ${isOpen ? "open" : "closed"}`}>
        {isOpen ? 
          <button onClick={gotoProfiles}>Profiles</button> 
          : <button onClick={gotoProfiles}>∑</button>}
      </div>
      <div className={`sidebar-element ${isOpen ? "open" : "closed"}`}>
        {isOpen ? 
          <button onClick={gotoGroups}>Groups</button> 
          : <button onClick={gotoGroups}>&#9675;</button>}
      </div>
    </div>
  );
};

export default Sidebar;
