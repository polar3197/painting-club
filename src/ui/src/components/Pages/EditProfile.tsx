import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useProfile } from "../../hooks/useProfile";
import { update_profile } from "../../api";
import { invalidateCached } from "../../cache";
import {
  ProfilePageColors, DEFAULT_PROFILE_COLORS, PROFILE_COLOR_ELEMENTS,
  decodeStoredColors, encodeColorsForStorage, parseColorToRgb, rgbToHex,
} from "../../utils/profileColors";
import "../../styles/edit-profile.css";

type Tab = "details" | "colors";
type ColorElement = keyof ProfilePageColors;

// A dollhouse of the profile page: the same beats (identity row, pic,
// statement card, media tabs, one art card) with placeholder content, so the
// preview reads as "your page". The element being recolored gets a blue ring.
function MiniProfile({ colors, highlight }: { colors: ProfilePageColors; highlight: ColorElement | null }) {
  const hl = (el: ColorElement) => (highlight === el ? " mini-hl" : "");
  return (
    <div className={`mini-page${hl("bg")}`} style={{ backgroundColor: colors.bg }}>
      <div className="mini-top">
        <div className="mini-identity">
          <div className={`mini-name-group${hl("nameText")}`}>
            <div className="mini-name" style={{ color: colors.nameText }}>67 1738</div>
            <div className="mini-location" style={{ color: colors.nameText }}>420, 69</div>
          </div>
          <div className="mini-actions">
            {[0, 1, 2, 3].map((i) => <span key={i} className={`mini-action${hl("actionBtn")}`} style={{ backgroundColor: colors.actionBtn }} />)}
          </div>
        </div>
        <div className={`mini-pic-wrap${hl("picFrame")}`}>
          <div className="mini-pic" style={{ borderColor: colors.picFrame }} />
        </div>
      </div>
      <div className={`mini-bio${hl("statementBox")}`} style={{ backgroundColor: colors.statementBox }}>
        <div className="mini-bio-label">Artist Statement</div>
        <div className="mini-bio-hr" />
        <div className="mini-line" style={{ width: "92%" }} /><div className="mini-line" style={{ width: "84%" }} /><div className="mini-line" style={{ width: "58%" }} />
      </div>
      <div className="mini-tabs">
        <div className={`mini-tab${hl("mediaTabSelected")}`} style={{ backgroundColor: colors.mediaTabSelected }}>painting</div>
        <div className={`mini-tab${hl("mediaTab")}`} style={{ backgroundColor: colors.mediaTab }}>drawing</div>
        <div className={`mini-tab${hl("mediaTab")}`} style={{ backgroundColor: colors.mediaTab }}>writing</div>
      </div>
      <div className={`mini-art${hl("artCardBg")}`} style={{ backgroundColor: colors.artCardBg }}>
        <div className="mini-art-img" />
        <div className="mini-line" style={{ width: "45%", marginTop: 6 }} />
      </div>
    </div>
  );
}

// Reached from the pencil on one's own profile: profile details, and the
// color scheme the page wears (stored as profile_colors, shared with iOS).
export default function EditProfile() {
  const navigate = useNavigate();
  const { currentUser, token } = useAuth()!;
  const [profile, setProfile] = useProfile(currentUser ?? undefined);
  const [tab, setTab] = useState<Tab>("details");
  const [firstname, setFirstname] = useState("");
  const [lastname, setLastname] = useState("");
  const [city, setCity] = useState("");
  const [stateVal, setStateVal] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [colors, setColors] = useState<ProfilePageColors>(DEFAULT_PROFILE_COLORS);
  const [selected, setSelected] = useState<ColorElement | null>(null);
  // Colors ride the save only once touched — otherwise a details-only save
  // would freeze today's defaults into the row.
  const [colorsDirty, setColorsDirty] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setFirstname(profile.firstname || "");
    setLastname(profile.lastname || "");
    setCity(profile.city || "");
    setStateVal(profile.state || "");
    setBio(profile.bio || "");
    setColors({ ...DEFAULT_PROFILE_COLORS, ...decodeStoredColors(profile.profile_colors) });
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setColor = (el: ColorElement, hex: string) => {
    setColors((c) => ({ ...c, [el]: hex }));
    setColorsDirty(true);
  };

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!profile || !currentUser || saving) return;
    setSaving(true);
    try {
      const updated = { ...profile, firstname, lastname, city, state: stateVal, bio };
      if (colorsDirty) updated.profile_colors = encodeColorsForStorage(colors);
      await update_profile(currentUser, updated, token);
      setProfile(updated);
      invalidateCached(`profile:${currentUser}`);
      navigate(`/members/${currentUser}/profile`);
    } catch (err) {
      alert((err as Error).message || "could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="page ep-page">
      <button className="back-btn" onClick={() => navigate(currentUser ? `/members/${currentUser}/profile` : "/home")}>‹ back</button>
      <div className="ep-inner">
        <div className="ep-tabs">
          <button className={`ep-tab ${tab === "details" ? "on" : ""}`} onClick={() => setTab("details")}>profile details</button>
          <button className={`ep-tab ${tab === "colors" ? "on" : ""}`} onClick={() => setTab("colors")}>color scheme</button>
        </div>

        {!profile ? <p className="ep-empty">loading…</p> : tab === "details" ? (
          <form className="ep-form" onSubmit={save}>
            <label>first name</label>
            <input value={firstname} onChange={(e) => setFirstname(e.target.value)} placeholder="first name" />
            <label>last name</label>
            <input value={lastname} onChange={(e) => setLastname(e.target.value)} placeholder="last name" />
            <label>city</label>
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="city" />
            <label>state</label>
            <input value={stateVal} onChange={(e) => setStateVal(e.target.value)} placeholder="state" />
            <label>artist statement</label>
            <textarea rows={10} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="no pressure" />
            <button type="submit" className="ep-save" disabled={saving}>{saving ? "saving…" : "save"}</button>
          </form>
        ) : (
          <div className="ep-colors">
            <MiniProfile colors={colors} highlight={selected} />
            {/* one button per recolorable element, wearing its current color */}
            <div className="ep-elements">
              {PROFILE_COLOR_ELEMENTS.map(({ key, label }) => (
                <button key={key} className={`ep-element ${selected === key ? "on" : ""}`} onClick={() => setSelected(selected === key ? null : key)}>
                  <span className="ep-swatch" style={{ backgroundColor: colors[key] }} />
                  <span className="ep-element-label">{label}</span>
                </button>
              ))}
            </div>
            {selected && (
              <label className="ep-picker">
                <span>{PROFILE_COLOR_ELEMENTS.find((e) => e.key === selected)?.label} color</span>
                <input type="color" value={rgbToHex(parseColorToRgb(colors[selected]))} onChange={(e) => setColor(selected, e.target.value)} />
                <span className="ep-hex">{rgbToHex(parseColorToRgb(colors[selected]))}</span>
              </label>
            )}
            <div className="ep-color-actions">
              <button className="ep-default" onClick={() => { setColors(DEFAULT_PROFILE_COLORS); setColorsDirty(true); }}>use default</button>
              <button className="ep-save" onClick={() => save()} disabled={saving}>{saving ? "saving…" : "save"}</button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
