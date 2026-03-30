import "../../styles/announcements.css";

const Announcement = ({ message }: { message: string }) => {
  return (
    <div className="announcement-item">
      <p>{message}</p>
    </div>
  );
};

const Announcements = (
  { bottom, left } : { bottom : number; left: number; }
) => {
  const announcements = [
    "Painting Club meets Sunday 02/15 @ 3pm @ charlie's house for indoor still life",
  ];

  return (
    <div className="announcements" style={{ bottom: `${bottom}rem`, left: `${left}rem`}}>
      <h2 className="announcements-header">Announcements</h2>
      <div className="announcements-body">
        {announcements.map((a, index) => (
          <Announcement key={index} message={a} />
        ))}
      </div>
    </div>
  );
};

export default Announcements;
