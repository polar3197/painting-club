
import { Dispatch, SetStateAction, useState } from "react";
import "../../styles/utils/dropdown.css";


export const SelectTextBox = (
    { setIsOpen, setItemsName, setUsername, setCity } : 
    { setIsOpen: Dispatch<SetStateAction<boolean>>; 
      setItemsName: Dispatch<SetStateAction<string>>;
      setUsername: Dispatch<SetStateAction<string>>;
      setCity: Dispatch<SetStateAction<string>>;
    }
) => {
    var keyBinds = {
        "c/" : "cities",
        "u/" : "usernames"
    }
    const [search, setSearch] = useState("");
    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        const searchSoFar = e.target.value;
        setSearch(searchSoFar)
        if (!searchSoFar) {                                                                                                                     
            setUsername("");                                                                                                                  
            setCity("");                                                                                                                      
            return;                                                                                                                             
        }
        setItemsName(keyBinds[searchSoFar.slice(0, 2) as keyof typeof keyBinds]);
    };

    return (
        <div className="search-box">
            <input
                value={search}
                placeholder={"use c/ to search cities, u/ to search usernames"}
                onChange={(e) => {handleSearch(e)}}
                onFocus={() => setIsOpen(true)}
                onBlur={() => setIsOpen(false)}
            />
        </div>
    )
};