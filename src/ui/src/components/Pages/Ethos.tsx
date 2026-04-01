
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
                    -•Painting Club Ethos•-
                </div>
                <div className="ethos-content">
                    <p>This is a general introduction to the spirit of painting club, actually this is all gibberish, an official and succinct doc will be written and placed here to communicate what is achieved here and why it is fun and philosophically important — nigh crucial!</p> 
                    <br></br>
                    <p>Online participation has become co-opted and turned into continual and pervasive exploitation and mental-priming by the businessmen — why do we enter this contract? For a fun way to connect with our friends over the internet.</p>
                    <br></br>
                    <p>Social connection should not be monetized. That brings us to the four tenants of Painting Club</p>
                    <ol style={{padding: "5px 0px 0px 60px"}}>
                        <b><li>No advertising</li></b>
                        <b><li>No AI</li></b>
                        <b><li>Sincerity as the core metric</li></b>
                    </ol>
                    <p>And so one must ask, what is worst about social media today? There are four fundamental problems: infinite-scroll (addiction); the algorithm (funnels you away from your friends and into ads and biases); success metric (content is given a valuation based on virality and shock value, which biases towards a morally hollow community culture); </p>
                </div>
            </div>
        </div>
    )
}

export default Ethos;