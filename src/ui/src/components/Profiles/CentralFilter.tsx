import Dropdown from "../Utils/Dropdown";
import "../../styles/profiles/filters.css";

const CentralFilter = (
    { header, options, onSearch, placeholder } :
    { header: string; options: string[]; onSearch: (query: string) => void; placeholder: string; }
) => {
    return (
        <div className="filter-bar">
            <span className="filter-header">{header}</span>
            <div style={{ position: "relative", width: "40%" }}>
                <Dropdown
                    placeholder={placeholder}
                    options={options}
                    onSelect={(value) => onSearch(value)}
                    onInputChange={(raw) => onSearch(raw)}
                />
            </div>
        </div>
    );
};

export default CentralFilter;
