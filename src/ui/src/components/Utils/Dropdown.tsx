
import { Dispatch, SetStateAction, useState } from "react";
import { useOptions } from "../../hooks/useOptions";
import "../../styles/utils/dropdown.css";

interface OptionQuery {
    // specifies what the useOptions hook will return from the database
    entity: string[]; // could be member, media, etc
    fields: string[]; // for member this could be username, city, etc.
}


export const SelectTextBox = (
    { setIsOpen, placeholder } : 
    { 
        setIsOpen: Dispatch<SetStateAction<boolean>>;
        placeholder: string;
    }
) => {
    const [search, setSearch] = useState("");
    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        const searchSoFar = e.target.value;
        setSearch(searchSoFar)
        if (!searchSoFar) {                                                                                                                     
                                                                                                                                  
            return;                                                                                                                             
        }
    };

    return (
        <div className="search-box">
            <input
                value={search}
                placeholder={`${placeholder}`}
                onChange={(e) => {handleSearch(e)}}
                onFocus={() => setIsOpen(true)}
                onBlur={() => setIsOpen(false)}
            />
        </div>
    )
}


const Dropdown = (
    { placeholder } : {placeholder: string; }
    // { fieldsToSet, keyBinds, optionSpec } : 
    // { fieldsToSet: Dispatch<SetStateAction<string>>[]; 
    //   keyBinds: string[]; 
    //   optionSpec: OptionQuery;
    // }
) => {
    // generic hook to fetch options from db
    const options = [ // useOptions(optionSpec);
        "board",
        "canvas",
        "glass",
        "copper",
        "watercolor",
        "acrylic",
        "paper",
    ]
    
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="dropdown">
            <SelectTextBox 
                setIsOpen={setIsOpen}
                placeholder={placeholder}
            />
            {isOpen && 
                <div className="select-container">
                    {options.map(option => (
                        <div key={option} className="select-item" 
                            onClick={() => {
                                console.log("option: ", option); 
                                setIsOpen(false);
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