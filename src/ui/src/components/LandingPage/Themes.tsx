import "../../styles/themes.css";

const themes = [
  "milton avery",
  "fairfield porter",
  "thiebaud",
  "diebenkorn",
  "franz kline",
];

const handleClick = (_theme: string) => {};

const Theme = ({ name, onClick }: { name: string; onClick: () => void }) => {
  return (
    <div className="theme" onClick={onClick}>
      <p>{name}</p>
    </div>
  );
};

const Themes = () => {
  return (
    <div className="themes">
      {themes.map((theme, index) => (
        <Theme
          key={index}
          name={theme}
          onClick={() => handleClick(theme)}
        />
      ))}
    </div>
  );
};

export default Themes;
