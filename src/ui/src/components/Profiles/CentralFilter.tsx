import { Dispatch, SetStateAction, useState } from "react";
import { useOptions } from "../../hooks/useOptions";
import { SelectTextBox } from "../Utils/Dropdown";
import "../../styles/profiles/filters.css";


const CentralFilter = (
    { setUsername, setCity } : 
    { setUsername: Dispatch<SetStateAction<string>>, 
        setCity: Dispatch<SetStateAction<string>> }
) => {
    const [userOptions, cityOptions, error, loading] = useOptions();
    var options = {
        "usernames" : userOptions,
        "cities" : cityOptions
    }
    var optionSetters = {
        "usernames" : setUsername,
        "cities" : setCity
    }
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="filter-bar">
            <div style={{ position: "relative" }}>
                <SelectTextBox 
                    setIsOpen={setIsOpen} 
                />
                {isOpen && 
                    <div className="select-container" onMouseDown={(e) => e.preventDefault()}>
                        {options["usernames" as keyof typeof options]?.map(item => (
                            item.length > 0 && 
                                <div key={item} className="select-item" onClick={() => {console.log("item: ", item); optionSetters["usernames" as keyof typeof optionSetters](item)}}>
                                    {item}
                                </div>
                        ))}
                    </div>
                }
            </div>
        </div>
    )
}

export default CentralFilter;