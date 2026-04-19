import Dropdown from "../Utils/Dropdown";
import "../../styles/profiles/filters.css";

const CentralFilter = (
    { header, options, chips, onAddChip, onRemoveChip, onQueryChange, placeholder, bannerSrc } :
    {
        header: string;
        options: string[];
        chips: string[];
        onAddChip: (value: string) => void;
        onRemoveChip: (value: string) => void;
        onQueryChange: (value: string) => void;
        placeholder: string;
        bannerSrc?: string;
    }
) => {
    const availableOptions = options.filter(o => !chips.includes(o));
    return (
        <>
            <div className="filter-bar">
                <div className="filter-bar-left">
                    {bannerSrc && <img className="filter-bar-banner" src={bannerSrc} alt="" />}
                    <span className="filter-header">{header}</span>
                </div>
                <div className="filter-bar-search">
                    <Dropdown
                        placeholder={placeholder}
                        options={availableOptions}
                        onSelect={(value) => {
                            onAddChip(value);
                            onQueryChange("");
                        }}
                        onInputChange={onQueryChange}
                    />
                </div>
            </div>
            {chips.length > 0 && (
                <div className="filter-chips">
                    {chips.map(chip => (
                        <div key={chip} className="bubble">
                            <div className="bubble-name">{chip}</div>
                            <div className="bubble-x" onClick={() => onRemoveChip(chip)}>x</div>
                        </div>
                    ))}
                </div>
            )}
        </>
    );
};

export default CentralFilter;
