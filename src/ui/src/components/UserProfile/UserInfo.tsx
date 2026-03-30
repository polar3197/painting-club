import { Dispatch, SetStateAction, useState } from "react";
import { Profile } from "../../api";
import "../../styles/user-profile/user-deets.css";


const UserQuestion = (
    { question, answer } : { question : string; answer : string;}
) => {
    return (
        <div className="question-wrapper">
            <div className="question">
                {question}
            </div>
            <div className="answer">
                {answer}
            </div>
        </div>
    )
}


const UserInfo = (
    {
        profile,
        setProfile
    } 
    : 
    {
        profile : Profile;
        setProfile : Dispatch<SetStateAction<Profile | null>>;
    }
) => {
    // const [editMode, setEditMode] = useState<boolean>(false);

    // const handleEdit = () => {
    //     if (editMode) {
    //     // logic to persist profile changes back to DB
    //     }
    //     setEditMode(!editMode)
    // };

    return (
        <div className="user-fields">
            <div className="uf-left">
                <div className="user-name">
                    {profile.firstname} {profile.lastname}
                </div>
                <div className="user-field-element">
                    {profile.city}
                </div>
                <br></br>
                <div className="user-field-element">
                    <b>artist statement:</b>
                    <p>{profile.bio}</p>
                </div>
            </div>
            <div className="uf-right">
                <UserQuestion 
                    question="biggest art inspo recently"
                    answer="fill in"
                />
                <UserQuestion 
                    question="go to art song"
                    answer="fill in"
                />
                <UserQuestion 
                    question="least favorite art piece"
                    answer="fill in"
                />
                <UserQuestion 
                    question="favorite quote"
                    answer="fill in"
                />
            </div>
        </div>
    )
}

export default UserInfo;