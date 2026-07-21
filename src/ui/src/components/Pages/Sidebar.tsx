import "../../styles/sidebar.css";
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { get_unread_count } from "../../api";

const UNREAD_POLL_MS = 15000;

interface SidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
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

// Rail mirrors the iOS tab bar: home (title), me, stuff, share, messages.
// Admin/logout/delete live behind the profile gear; docs hang off Home.
const Sidebar = ({ isOpen }: SidebarProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth()!;
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!currentUser) {
      setUnread(0);
      return;
    }
    const tick = () => {
      const token = localStorage.getItem("token");
      if (!token) return;
      get_unread_count(token).then((r) => setUnread(r.unread)).catch(() => {});
    };
    tick();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") tick();
    }, UNREAD_POLL_MS);
    return () => clearInterval(timer);
  }, [currentUser]);

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

  const gotoStuff = () => {
    navigate("/stuff");
  };

  const gotoShare = () => {
    navigate(currentUser ? "/share" : "/not-a-member");
  };

  const gotoMessages = () => {
    navigate(currentUser ? "/messages" : "/not-a-member");
  };

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
        <SidebarElement isOpen={isOpen} label="stuff" imgSrc="/imgs/art.png" onClick={gotoStuff}>
          {isOpen ? "Stuff" : <img src="/imgs/art.png" width="100%" height="100%" />}
        </SidebarElement>
        <SidebarElement isOpen={isOpen} label="share" onClick={gotoShare}>
          {isOpen ? "Share" : <span className="sidebar-glyph">+</span>}
        </SidebarElement>
        <SidebarElement isOpen={isOpen} label="messages" onClick={gotoMessages}>
          {isOpen ? "Messages" : <span className="sidebar-glyph">✉</span>}
          {unread > 0 && <span className="sidebar-unread-dot" />}
        </SidebarElement>
      </div>
    </div>
  );
};

export default Sidebar;
