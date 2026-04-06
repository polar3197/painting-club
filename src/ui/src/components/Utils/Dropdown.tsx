
import Fuse from "fuse.js";
import { Dispatch, SetStateAction, useState } from "react";
import "../../styles/utils/dropdown.css";


export const SelectTextBox = (
    { setIsOpen, placeholder, search, setSearch } :
    {
        setIsOpen: Dispatch<SetStateAction<boolean>>;
        placeholder: string;
        search: string;
        setSearch: (value: string) => void;
    }
) => {
    return (
        <div className="search-box">
            <input
                value={search}
                placeholder={placeholder}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setIsOpen(true)}
                onClick={() => setIsOpen(true)}
                onBlur={() => setIsOpen(false)}
            />
        </div>
    )
}


const Dropdown = (
    { placeholder, options, onSelect, onInputChange } :
    { placeholder: string; options: string[]; onSelect: (value: string) => void; onInputChange?: (raw: string) => void; }
) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");

    const handleSearch = (value: string) => {
        setSearch(value);
        onInputChange?.(value);
    };

    // strip prefix for fuzzy matching
    const query = search.startsWith("m/") ? search.slice(2) : search.startsWith("a/") ? search.slice(2) : search;
    const filtered = query
        ? new Fuse(options, { threshold: 0.4 }).search(query).map(r => r.item)
        : options;

    return (
        <div className="dropdown">
            <SelectTextBox
                setIsOpen={setIsOpen}
                placeholder={placeholder}
                search={search}
                setSearch={handleSearch}
            />
            {isOpen &&
                <div className="select-container" onMouseDown={(e) => e.preventDefault()}>
                    {filtered.map(option => (
                        <div key={option} className="select-item"
                            onClick={() => {
                                onSelect(option);
                                setIsOpen(false);
                                setSearch("");
                            }}>
                            {option}
                        </div>
                    ))}
                </div>
            }
        </div>
    )
}

export default Dropdown;
