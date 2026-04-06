
import "../../styles/ethos/ethos.css";
import { useNavigate } from "react-router-dom";

const Ethos = () => {
    const navigate = useNavigate();

    const gotoProfiles = () => {
        console.log("go to profiles");
        navigate(`/members`);
    };

    return (
        <div className="ethos-wrapper">
            <div className="leave-ethos" onClick={() => gotoProfiles()}>
                <p>&lt;—</p>
            </div>
            <div className="ethos-page">
                <div className="ethos-title">
                    Painting Club Ethos
                </div>
                <div className="ethos-content">
                    <hr />
                    <p style={{fontFamily: "serif", color: "rgb(66, 65, 65)"}}><i>"Underlying [the Web's] whole infrastructure was the intention to allow for collaboration, foster compassion and generate creativity — what I term the 3 C’s. It was to be a tool to empower humanity. [...] Yet in the past decade, instead of embodying these values, the web has instead played a part in eroding them."</i></p>
                    <p style={{display: "flex", justifyContent: "end", fontFamily: "serif", color: "rgb(66, 65, 65)"}}>- Tim Berners-Lee (creator of the World Wide Web)</p>
                    <hr />
                    <br></br>
                    <p>This is a general introduction to the spirit of Painting Club. Actually this is all gibberish, an official and succinct doc will be written and placed here to communicate what is achieved here and why it is fun and philosophically important.</p> 
                    <br></br>
                    <p>Painting Club is a big bet on my hope that community is more powerful than dopamine kicks.</p>
                    <br></br>
                    <p>Online participation has become co-opted and turned into continual and pervasive exploitation and mental-priming of vulnerable, isolated people, by powerful idiots. — why do we enter this contract? For a fun way to connect with our friends over the internet.</p>
                    <br></br>
                    <p>You have to be one sick mofo to prey upon people's desire to have connection and community. Connection is the purest and most fragile human desire —and Zuck twists and corrupts it before it can even stand up on its own.</p>
                    <br></br>
                    <p>Social connection should not be monetized. Annnnd, that brings us to the four tenants of Painting Club</p>
                    <br></br>
                    <ol style={{padding: "5px 0px 0px 60px"}}>
                        <b><li>no dopamine hooks</li></b>
                        <b><li>sincerity as the metric</li></b>
                        <b><li>no advertising</li></b>
                        <b><li>no ai (not in a reactionary way, in a humanane way)</li></b>
                    </ol>
                    <br></br>
                    <p>Some people might say "no dopamine hooks? how will you get people to use the app?" or "why would people choose painting club over instagram/tiktok?". These questions miss the point. The goal is not to get users; the goal is not to harvest attention; the goal is not to coerce members into participating. The goal is to provide an alternative.</p>
                </div>
            </div>
        </div>
    )
}

export default Ethos;