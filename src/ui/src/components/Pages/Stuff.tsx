import { useState } from "react";
import People from "./People";
import ArtGallery from "./ArtGallery";
import "../../styles/stuff.css";

// The iOS "stuff" tab: people and art side by side behind one doorway.
export default function Stuff() {
  const [tab, setTab] = useState<"people" | "art">("people");

  return (
    <>
      <div className="stuff-tabs">
        <button className={tab === "people" ? "active" : ""} onClick={() => setTab("people")}>
          people
        </button>
        <button className={tab === "art" ? "active" : ""} onClick={() => setTab("art")}>
          art
        </button>
      </div>
      {tab === "people" ? <People /> : <ArtGallery />}
    </>
  );
}
