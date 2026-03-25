import { Dispatch, SetStateAction, useState } from "react";
import { useOptions } from "../hooks/useOptions";
import { SelectTextBox } from "../components/Utils.tsx/Dropdown";


const Filters = (
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
    const [itemsName, setItemsName] = useState<string>("");
    return (
        <div className="filter-bar">
            <div style={{ position: "relative" }}>
                <SelectTextBox 
                    setIsOpen={setIsOpen} 
                    setItemsName={setItemsName}     // u/brody searches usernames. c/santa cruz searches cities, etc... 
                    setUsername={setUsername}
                    setCity={setCity}
                />
                {isOpen && 
                    <div className="select-container" onMouseDown={(e) => e.preventDefault()}>
                        {options[itemsName as keyof typeof options]?.map(item => (
                            item.length > 0 && 
                                <div key={item} className="select-item" onClick={() => {console.log("item: ", item); optionSetters[itemsName as keyof typeof optionSetters](item)}}>
                                    {item}
                                </div>
                        ))}
                    </div>
                }
            </div>
        </div>
    )
}

export default Filters;