import { FeatureRequestOut } from "../../api";
import KebabMenu from "./KebabMenu";
import "../../styles/feature-requests.css";

export default function FeatureRequestRow({ r, onVote, onDelete }: {
  r: FeatureRequestOut;
  onVote: (id: string, value: 1 | -1) => void;
  onDelete?: () => void;
}) {
  return (
    <div className="fr-row">
      <div className="fr-main">
        <span className="fr-title">{r.title}</span>
        {r.username && <span className="fr-meta">@{r.username}</span>}
      </div>
      <div className="fr-votes">
        <button className={`fr-vote ${r.my_vote === 1 ? "on" : ""}`} onClick={() => onVote(r.id, 1)}>↑ {r.up}</button>
        <button className={`fr-vote ${r.my_vote === -1 ? "on" : ""}`} onClick={() => onVote(r.id, -1)}>↓ {r.down}</button>
        {onDelete && <KebabMenu small items={[{ label: "delete", onClick: onDelete, destructive: true }]} />}
      </div>
    </div>
  );
}
