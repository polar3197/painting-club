import { Dispatch, SetStateAction, useState } from "react";
import { Profile, update_profile } from "../../api";
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
    const [updateProfile, setUpdateProfile] = useState<boolean>(false);
    const token = sessionStorage.getItem("token");

    const handleUpdateProfile = () => {
        if (profile.is_owner) {
            setUpdateProfile(true);
        }
    }

    const handleSumbitProfile = () => {
        setUpdateProfile(false);
        update_profile(profile.username, profile, token);
    }

    return (
        <div className="user-fields">
            <div className="uf-left">
                <div className="user-name" onClick={() => handleUpdateProfile()}>
                    {updateProfile ? 
                        <>
                        <textarea      
                            rows={1}
                            style={{ height: "100%", fontSize: "1.3rem" }}
                            value={profile.firstname}
                            placeholder="firstname"                                                                                                                      
                            onChange={(e) => setProfile({ ...profile, firstname: e.target.value })}                                                                 
                        />
                        <textarea      
                            rows={1}
                            style={{ height: "100%", fontSize: "1.3rem" }}
                            value={profile.lastname}
                            placeholder="lastname"                                                                                                                                                                                         
                        />
                        </>
                    :
                        <>
                        <p>{profile.firstname} {profile.lastname}</p>
                        </>
                    }
                </div>
                <div className="user-location" onClick={() => handleUpdateProfile()}>
                    {updateProfile ? 
                    <>
                        <textarea      
                            rows={1}
                            style={{ width: "80%", height: "100%", fontSize: "1rem" }}
                            value={profile.city}
                            placeholder="city"                                                                                                                      
                            onChange={(e) => setProfile({ ...profile, city: e.target.value })}                                                                 
                        />
                        <textarea      
                            rows={1}
                            style={{ width: "20%", height: "100%", fontSize: "1rem" }}
                            value={profile.state}
                            placeholder="state"                                                                                                                      
                            onChange={(e) => setProfile({ ...profile, state: e.target.value })}                                                                 
                        />
                    </>
                    :
                        <p>{profile.city}, {profile.state}</p>
                    }
                </div>
                <br></br>
                <div className="user-field-element" onClick={() => handleUpdateProfile()}>
                    {updateProfile ? 
                        <>
                        <b>artist statement:</b>
                        <textarea      
                            rows={11}
                            value={profile.bio}
                            placeholder="write a bio, limited to 255 chars"                                                                                                                      
                            onChange={(e) => setProfile({ ...profile, bio: e.target.value })}                                                           
                        />
                        </>
                    :
                        <>
                        <b>artist statement:</b>
                        <p>{profile.bio}</p>
                        </>
                    }
                </div>
                {updateProfile && <div className="submit-profile" onClick={() => handleSumbitProfile()}>submit</div>}
            </div>
            <div className="uf-right">
                <UserQuestion 
                    question="biggest art inspo recently:"
                    answer="fill in"
                />
                <UserQuestion 
                    question="go to art song:"
                    answer="fill in"
                />
                <UserQuestion 
                    question="least favorite art piece:"
                    answer="fill in"
                />
                <UserQuestion 
                    question="favorite quote:"
                    answer="fill in"
                />
            </div>
        </div>
    )
}

export default UserInfo;