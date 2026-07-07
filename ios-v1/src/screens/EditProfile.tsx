import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  Platform,
  PanResponder,
  GestureResponderEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { TextInput } from '../components/AppTextInput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../hooks';
import { update_profile } from '../api';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import {
  ProfilePageColors,
  DEFAULT_PROFILE_COLORS,
  PROFILE_COLOR_ELEMENTS,
  Hsv,
  parseColorToRgb,
  rgbToHex,
  rgbToHsv,
  hsvToRgb,
  decodeStoredColors,
  encodeColorsForStorage,
} from '../constants/profileColors';

type Tab = 'details' | 'colors';

type ColorElement = keyof ProfilePageColors;

// A dollhouse profile page: same layout beats as the real one (identity row,
// pic, statement card, media tabs, one art card) but with placeholder content
// so the preview reads as "your page", not your data. Text is swapped for
// gray bars where real content would be. The component currently being
// recolored (`highlight`) gets a blue border so it's obvious which part of
// the page the palette is aimed at.
function MiniProfile({
  colors,
  highlight,
}: {
  colors: ProfilePageColors;
  highlight: ColorElement | null;
}) {
  const hl = (el: ColorElement) =>
    highlight === el ? { borderColor: Colors.blue, borderWidth: 2 } : null;
  return (
    <View style={[mini.page, { backgroundColor: colors.bg }, hl('bg')]}>
      <View style={mini.topRow}>
        <View style={mini.identity}>
          {/* nameText colors the name + location. Like the frame, it can't be
              painted blue when selected, so a ring wraps the text group and the
              chosen color stays visible inside. */}
          <View style={[mini.nameGroup, highlight === 'nameText' && mini.nameGroupHighlight]}>
            <Text style={[mini.name, { color: colors.nameText }]}>67 1738</Text>
            <Text style={[mini.location, { color: colors.nameText }]}>420, 69</Text>
          </View>
          <View style={mini.actionRow}>
            {[0, 1, 2, 3].map((i) => (
              <View
                key={i}
                style={[mini.actionBtn, { backgroundColor: colors.actionBtn }, hl('actionBtn')]}
              />
            ))}
          </View>
        </View>
        {/* The frame IS the color being previewed, so highlighting can't
            paint it blue like the other components — instead a blue ring
            wraps the pic, leaving the chosen frame color visible inside.
            The transparent border is always reserved so toggling the
            highlight doesn't shift layout. */}
        <View style={[mini.picWrap, highlight === 'picFrame' && mini.picWrapHighlight]}>
          <View style={[mini.pic, { borderColor: colors.picFrame }]} />
        </View>
      </View>
      <View
        style={[mini.bioCard, { backgroundColor: colors.statementBox }, hl('statementBox')]}
      >
        <Text style={mini.bioLabel}>Artist Statement</Text>
        <View style={mini.bioHr} />
        <View style={[mini.bioLine, { width: '92%' }]} />
        <View style={[mini.bioLine, { width: '84%' }]} />
        <View style={[mini.bioLine, { width: '58%' }]} />
      </View>
      <View style={mini.tabsRow}>
        <View
          style={[mini.tab, { backgroundColor: colors.mediaTabSelected }, hl('mediaTabSelected')]}
        >
          <Text style={mini.tabText}>painting</Text>
        </View>
        <View style={[mini.tab, { backgroundColor: colors.mediaTab }, hl('mediaTab')]}>
          <Text style={mini.tabText}>drawing</Text>
        </View>
      </View>
      <View style={mini.tabsRow}>
        <View style={[mini.tab, { backgroundColor: colors.mediaTab }, hl('mediaTab')]}>
          <Text style={mini.tabText}>writing</Text>
        </View>
        <View style={[mini.tab, { backgroundColor: colors.mediaTab }, hl('mediaTab')]}>
          <Text style={mini.tabText}>+/-</Text>
        </View>
      </View>
      <View style={[mini.artCard, { backgroundColor: colors.artCardBg }, hl('artCardBg')]}>
        <View style={mini.artImage} />
        <View style={[mini.bioLine, { width: '45%', marginTop: 6, marginBottom: 0 }]} />
      </View>
    </View>
  );
}

// Reached from the pencil button on one's own profile. The details tab holds
// the fields that used to be edited inline on the profile frame; the color
// scheme tab will let members set the colors their own page wears.
export default function EditProfile() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { currentUser, token } = useAuth();
  const [profile, setProfile] = useProfile(currentUser ?? undefined);

  const [tab, setTab] = useState<Tab>('details');
  const [firstname, setFirstname] = useState('');
  const [lastname, setLastname] = useState('');
  const [city, setCity] = useState('');
  const [stateVal, setStateVal] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  // Preview-only for now — how these colors are stored (and applied to the
  // real profile page) is the next step.
  const [pageColors, setPageColors] = useState<ProfilePageColors>(DEFAULT_PROFILE_COLORS);
  const [selectedElement, setSelectedElement] = useState<ColorElement | null>(null);
  // Colors ride the save payload only once the member actually touches them —
  // otherwise a details-only save would freeze the current app defaults into
  // their row and future default-palette tweaks would never reach them.
  const [colorsDirty, setColorsDirty] = useState(false);

  // --- HSV picker state ---
  // The picker drives pageColors[selectedElement] live while dragging. Pan
  // handlers are created once, so anything they read lives in refs; the
  // matching useState copies exist only to re-render thumbs/gradients.
  const [hsv, setHsv] = useState<Hsv>({ h: 36, s: 0.6, v: 0.95 });
  const hsvRef = useRef(hsv);
  const selectedElementRef = useRef<ColorElement | null>(null);
  // Scroll steals vertical drags from the picker, so scrolling is disabled
  // while a picker gesture is down.
  const [pickerActive, setPickerActive] = useState(false);
  const [svSize, setSvSize] = useState({ w: 0, h: 0 });
  const svSizeRef = useRef(svSize);
  const [hueW, setHueW] = useState(0);
  const hueWRef = useRef(0);

  const selectElement = (key: ColorElement | null) => {
    setSelectedElement(key);
    selectedElementRef.current = key;
    if (key) {
      // Seed the picker from the element's current color.
      const seeded = rgbToHsv(parseColorToRgb(pageColors[key]));
      setHsv(seeded);
      hsvRef.current = seeded;
    }
  };

  const applyHsv = (next: Hsv) => {
    hsvRef.current = next;
    setHsv(next);
    const el = selectedElementRef.current;
    if (el) {
      const hex = rgbToHex(hsvToRgb(next));
      setPageColors((prev) => ({ ...prev, [el]: hex }));
      setColorsDirty(true);
    }
  };

  const resetColorsToDefault = () => {
    setPageColors(DEFAULT_PROFILE_COLORS);
    setColorsDirty(true);
    if (selectedElementRef.current) {
      const seeded = rgbToHsv(
        parseColorToRgb(DEFAULT_PROFILE_COLORS[selectedElementRef.current])
      );
      setHsv(seeded);
      hsvRef.current = seeded;
    }
  };

  const handleSvTouch = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    const { w, h } = svSizeRef.current;
    if (w <= 0 || h <= 0) return;
    const s = Math.min(1, Math.max(0, locationX / w));
    const v = 1 - Math.min(1, Math.max(0, locationY / h));
    applyHsv({ ...hsvRef.current, s, v });
  };

  const handleHueTouch = (e: GestureResponderEvent) => {
    const { locationX } = e.nativeEvent;
    const w = hueWRef.current;
    if (w <= 0) return;
    const h = Math.min(1, Math.max(0, locationX / w)) * 360;
    applyHsv({ ...hsvRef.current, h });
  };

  const svResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        setPickerActive(true);
        handleSvTouch(e);
      },
      onPanResponderMove: handleSvTouch,
      onPanResponderRelease: () => setPickerActive(false),
      onPanResponderTerminate: () => setPickerActive(false),
    })
  ).current;

  const hueResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        setPickerActive(true);
        handleHueTouch(e);
      },
      onPanResponderMove: handleHueTouch,
      onPanResponderRelease: () => setPickerActive(false),
      onPanResponderTerminate: () => setPickerActive(false),
    })
  ).current;

  // Seed the form once the profile arrives. useProfile refetches on mount, so
  // this runs exactly once per visit with fresh server data.
  useEffect(() => {
    if (!profile) return;
    setFirstname(profile.firstname || '');
    setLastname(profile.lastname || '');
    setCity(profile.city || '');
    setStateVal(profile.state || '');
    setBio(profile.bio || '');
    // Saved colors are partial — merge over defaults so components the member
    // never touched (or added after they saved) still get the app palette.
    // decodeStoredColors splits a packed picFrame back into picFrame + nameText.
    setPageColors({ ...DEFAULT_PROFILE_COLORS, ...decodeStoredColors(profile.profile_colors) });
  }, [profile?.id]);

  const save = async () => {
    if (!profile || !currentUser || saving) return;
    setSaving(true);
    try {
      const updated = { ...profile, firstname, lastname, city, state: stateVal, bio };
      if (colorsDirty) {
        // Fold the 8 in-app colors into the 7 keys the backend accepts: every
        // color normalizes to '#rrggbb', except nameText, which packs into
        // picFrame (only when the member set a custom name color).
        updated.profile_colors = encodeColorsForStorage(pageColors);
      }
      await update_profile(currentUser, updated, token);
      setProfile(updated);
      // Back to the profile — its focus listener refetches, so the new
      // values show up immediately.
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.inner, { paddingTop: insets.top + 12 }]}>
        {/* details <-> color scheme toggle, styled like the profile's media
            tabs. No page title above it — vertical room goes to the content
            so the bottom action buttons stay on screen. */}
        <View style={styles.tabRow}>
          <Pressable
            style={[styles.tabBtn, tab === 'details' && styles.tabBtnSelected]}
            onPress={() => setTab('details')}
          >
            <Text style={styles.tabBtnText}>profile details</Text>
          </Pressable>
          <Pressable
            style={[styles.tabBtn, tab === 'colors' && styles.tabBtnSelected]}
            onPress={() => setTab('colors')}
          >
            <Text style={styles.tabBtnText}>color scheme</Text>
          </Pressable>
        </View>

        {tab === 'details' ? (
          <ScrollView
            style={styles.detailsScroll}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            // iOS insets the scroll content by the keyboard height, so every
            // field (and the save button) can scroll into view above it —
            // replaces the old KeyboardAvoidingView, which fought the scroll.
            automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
            contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.fieldLabel}>first name</Text>
            <TextInput
              style={styles.fieldInput}
              value={firstname}
              onChangeText={setFirstname}
              placeholder="first name"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
            />
            <Text style={styles.fieldLabel}>last name</Text>
            <TextInput
              style={styles.fieldInput}
              value={lastname}
              onChangeText={setLastname}
              placeholder="last name"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
            />
            <Text style={styles.fieldLabel}>city</Text>
            <TextInput
              style={styles.fieldInput}
              value={city}
              onChangeText={setCity}
              placeholder="city"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
            />
            <Text style={styles.fieldLabel}>state</Text>
            <TextInput
              style={styles.fieldInput}
              value={stateVal}
              onChangeText={setStateVal}
              placeholder="state"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
            />
            <Text style={styles.fieldLabel}>artist statement</Text>
            <TextInput
              style={[styles.fieldInput, styles.bioInput]}
              value={bio}
              onChangeText={setBio}
              placeholder="no pressure"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              multiline
            />
            <Pressable
              style={[styles.saveBtn, saving && { opacity: 0.5 }]}
              onPress={save}
              disabled={saving}
            >
              <Text style={styles.saveBtnText}>{saving ? 'saving…' : 'save'}</Text>
            </Pressable>
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            showsVerticalScrollIndicator={false}
            scrollEnabled={!pickerActive}
          >
            <MiniProfile colors={pageColors} highlight={selectedElement} />

            {/* The 7 component buttons — each controls one part of the page.
                Each button wears its component's current color. */}
            <View style={styles.elementRow}>
              {PROFILE_COLOR_ELEMENTS.map(({ key, label }) => (
                <Pressable
                  key={key}
                  style={styles.elementBtnWrap}
                  onPress={() => selectElement(selectedElement === key ? null : key)}
                >
                  <View
                    style={[
                      styles.elementBtn,
                      { backgroundColor: pageColors[key] },
                      selectedElement === key && styles.elementBtnSelected,
                    ]}
                  />
                  <Text
                    style={[
                      styles.elementLabel,
                      selectedElement === key && { color: Colors.blue },
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* HSV picker: saturation/brightness panel + hue strip. Drives the
                selected component's color live while dragging. */}
            {selectedElement && (
              <View style={styles.pickerWrap}>
                <View
                  style={styles.svPanel}
                  onLayout={(e) => {
                    const { width, height } = e.nativeEvent.layout;
                    setSvSize({ w: width, h: height });
                    svSizeRef.current = { w: width, h: height };
                  }}
                  {...svResponder.panHandlers}
                >
                  {/* The gradients are static PNGs stretched by expo-image
                      (only the base hue varies, and that's a plain View) —
                      no expo-linear-gradient, so this renders identically on
                      the shimmed 1.0.3 binary and the 1.0.4 native build. */}
                  <View
                    style={[
                      StyleSheet.absoluteFill,
                      { backgroundColor: rgbToHex(hsvToRgb({ h: hsv.h, s: 1, v: 1 })) },
                    ]}
                  />
                  <Image
                    source={require('../../assets/imgs/sv-white.png')}
                    style={StyleSheet.absoluteFill}
                    contentFit="fill"
                  />
                  <Image
                    source={require('../../assets/imgs/sv-black.png')}
                    style={StyleSheet.absoluteFill}
                    contentFit="fill"
                  />
                  {svSize.w > 0 && (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.svThumb,
                        {
                          left: Math.min(svSize.w - 18, Math.max(0, hsv.s * svSize.w - 9)),
                          top: Math.min(svSize.h - 18, Math.max(0, (1 - hsv.v) * svSize.h - 9)),
                        },
                      ]}
                    />
                  )}
                </View>
                <View
                  style={styles.hueStrip}
                  onLayout={(e) => {
                    const { width } = e.nativeEvent.layout;
                    setHueW(width);
                    hueWRef.current = width;
                  }}
                  {...hueResponder.panHandlers}
                >
                  <Image
                    source={require('../../assets/imgs/hue-bar.png')}
                    style={StyleSheet.absoluteFill}
                    contentFit="fill"
                  />
                  {hueW > 0 && (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.hueThumb,
                        { left: Math.min(hueW - 10, Math.max(0, (hsv.h / 360) * hueW - 5)) },
                      ]}
                    />
                  )}
                </View>
              </View>
            )}

            <View style={styles.colorActionsRow}>
              <Pressable style={styles.defaultBtn} onPress={resetColorsToDefault}>
                <Text style={styles.defaultBtnText}>use default</Text>
              </Pressable>
              <Pressable
                style={[styles.saveBtn, { alignSelf: 'auto', marginTop: 0 }, saving && { opacity: 0.5 }]}
                onPress={save}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>{saving ? 'saving…' : 'save'}</Text>
              </Pressable>
            </View>
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.mainBg,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 30,
  },
  // Fill the remaining height so the scroll frame reaches the screen bottom —
  // gives automaticallyAdjustKeyboardInsets a full frame to inset against.
  detailsScroll: {
    flex: 1,
  },
  tabRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 20,
  },
  tabBtn: {
    // Wider + a touch taller than the profile's media tabs — this pair is the
    // page's whole header, so it gets more presence.
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.secondary,
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  tabBtnSelected: {
    backgroundColor: Colors.primaryGold,
  },
  tabBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
  },
  fieldLabel: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  fieldInput: {
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    paddingVertical: 6,
    marginBottom: 18,
  },
  bioInput: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  saveBtn: {
    alignSelf: 'flex-end',
    marginTop: 4,
    backgroundColor: 'lightgreen',
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  saveBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
  },
  pickerWrap: {
    marginTop: 16,
    gap: 10,
  },
  colorActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
  },
  defaultBtn: {
    backgroundColor: Colors.secondary,
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  defaultBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
  },
  svPanel: {
    height: 170,
    borderWidth: 1,
    borderColor: '#000',
    overflow: 'hidden',
  },
  svThumb: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 1.5,
  },
  hueStrip: {
    height: 26,
    borderWidth: 1,
    borderColor: '#000',
    overflow: 'hidden',
  },
  hueThumb: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 10,
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 1.5,
  },
  elementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    // 8 swatches now; wrap to a second line on narrow phones rather than clip.
    flexWrap: 'wrap',
    rowGap: 10,
    marginTop: 16,
  },
  elementBtnWrap: {
    alignItems: 'center',
    gap: 3,
  },
  elementBtn: {
    width: 36,
    height: 36,
    borderWidth: 1,
    borderColor: '#000',
  },
  elementBtnSelected: {
    borderWidth: 2.5,
    borderColor: Colors.blue,
  },
  elementLabel: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.micro,
    color: Colors.textSecondary,
  },
});

// Placeholder "content" in the mini page renders as gray bars; real text is
// kept only where the profile shows chrome labels, at micro sizes.
const mini = StyleSheet.create({
  page: {
    borderWidth: 1,
    borderColor: '#000',
    borderRadius: 5,
    padding: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  identity: {
    flex: 1,
    gap: 2,
  },
  nameGroup: {
    alignSelf: 'flex-start',
    // Transparent border always reserved so the highlight doesn't shift layout.
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 4,
    marginHorizontal: -3,
    paddingHorizontal: 3,
  },
  nameGroupHighlight: {
    borderColor: Colors.blue,
  },
  name: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
  },
  location: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.micro,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
  },
  actionBtn: {
    width: 16,
    height: 16,
    borderWidth: 1,
    borderColor: '#000',
  },
  picWrap: {
    width: '30%',
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 5,
    padding: 2,
  },
  picWrapHighlight: {
    borderColor: Colors.blue,
  },
  pic: {
    width: '100%',
    aspectRatio: 1,
    borderWidth: 3,
    borderRadius: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },
  bioCard: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#000',
    borderRadius: 3,
    padding: 6,
  },
  bioLabel: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.micro,
    textAlign: 'center',
    marginBottom: 3,
  },
  bioHr: {
    height: 1,
    backgroundColor: '#000',
    marginBottom: 5,
  },
  bioLine: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
    marginBottom: 4,
  },
  tabsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  tab: {
    width: '48.5%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#000',
    paddingVertical: 3,
  },
  tabText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.micro,
  },
  artCard: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#000',
    padding: 6,
    backgroundColor: '#fff',
  },
  artImage: {
    height: 64,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
  },
});
