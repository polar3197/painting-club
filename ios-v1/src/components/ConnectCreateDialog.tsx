import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, FlatList, StyleSheet, Keyboard, Platform, useWindowDimensions } from 'react-native';
import Reanimated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { TextInput } from './AppTextInput';
import { appAlert } from './AppAlert';
import { thumbSource } from '../api';
import {
  addInspiration,
  createExternalArt,
  searchLinkTargets,
  WebEdge,
  WebNode,
  WebNodeArt,
} from '../api/inspiration';
import { Colors, Fonts, FontSizes } from '../constants/theme';

// The two-pane linking popup for the inspiration web: CONNECT searches club
// art + the shared external catalog together; CREATE adds an outside piece
// (artist required, image required, title optional) to the catalog and links
// it in one motion. Opened from a focused own piece's "+ inspiration" or a
// long-press on an own node.
export default function ConnectCreateDialog({ fromArt, linkedIds, onLinked, onClose }: {
  fromArt: WebNodeArt;
  linkedIds: Set<string>;
  onLinked: (edge: WebEdge) => void;
  onClose: () => void;
}) {
  const [pane, setPane] = useState<'connect' | 'create'>('connect');

  // Fixed card height so the dialog doesn't shrink as the search narrows and
  // both panes are the same size. Capped to the space left above the keyboard
  // (kbHeight drives the discrete cap; the animated paddingBottom below welds
  // the card to the keyboard frame — same recipe as AddArtDialog) so the tap
  // targets — result rows, "add & link" — never sink under the keyboard.
  const { height: winH } = useWindowDimensions();
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, (e) => setKbHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);
  const keyboard = useAnimatedKeyboard();
  const backdropStyle = useAnimatedStyle(() => ({ paddingBottom: keyboard.height.value }));
  const cardHeight = Math.min(winH * 0.62, winH - kbHeight - 24);

  // connect pane
  const [q, setQ] = useState('');
  const [results, setResults] = useState<WebNode[]>([]);

  // create pane
  const [artist, setArtist] = useState('');
  const [title, setTitle] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    searchLinkTargets(q)
      .then((r) => {
        if (!alive) return;
        setResults(r.filter((n) => n.id !== fromArt.id && !linkedIds.has(n.id)));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [q, fromArt.id, linkedIds]);

  const connect = async (target: WebNode) => {
    try {
      const edge = await addInspiration(fromArt.id, target.id);
      onLinked(edge);
      onClose();
    } catch {
      appAlert('could not link', 'try again');
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled && result.assets[0]) setImageUri(result.assets[0].uri);
  };

  const create = async () => {
    if (!artist.trim() || !imageUri || busy) return;
    setBusy(true);
    try {
      const node = await createExternalArt({ artist: artist.trim(), title: title.trim() || undefined, imageUri });
      const edge = await addInspiration(fromArt.id, node.id);
      onLinked(edge);
      onClose();
    } catch {
      appAlert('could not create', 'try again');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <Reanimated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.card, { height: cardHeight }]}>
          <Text style={styles.heading} numberOfLines={1}>
            inspiration for “{fromArt.title || 'untitled'}”
          </Text>
          <View style={styles.tabs}>
            {(['connect', 'create'] as const).map((p) => (
              <Pressable
                key={p}
                style={[styles.tab, pane === p && styles.tabActive]}
                onPress={() => setPane(p)}
              >
                <Text style={styles.tabText}>{p}</Text>
              </Pressable>
            ))}
          </View>

          {pane === 'connect' ? (
            <>
              <TextInput
                style={styles.input}
                value={q}
                onChangeText={setQ}
                placeholder="search art & artists"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                autoFocus
              />
              <FlatList
                data={results}
                keyExtractor={(n) => n.id}
                style={styles.results}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <Pressable style={styles.result} onPress={() => connect(item)}>
                    {item.kind === 'art' && item.artKind !== 'visual' ? (
                      // Written/audio have no visual thumb — inked glyphs.
                      <View style={[styles.resultThumb, styles.resultGlyphWrap]}>
                        <Image
                          source={
                            item.artKind === 'written'
                              ? require('../../assets/imgs/writing.png')
                              : require('../../assets/imgs/music.png')
                          }
                          style={styles.resultGlyph}
                          contentFit="contain"
                        />
                      </View>
                    ) : (
                      <Image
                        source={item.kind === 'art' ? thumbSource(item.id, item.file_path) : item.image}
                        style={styles.resultThumb}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                    )}
                    <View style={styles.resultText}>
                      <Text style={styles.resultTitle} numberOfLines={1}>
                        {item.title || 'untitled'}
                      </Text>
                      <Text style={styles.resultByline} numberOfLines={1}>
                        {item.kind === 'art' ? `${item.creator} · ${item.medium}` : item.artist}
                      </Text>
                    </View>
                  </Pressable>
                )}
              />
            </>
          ) : (
            <View style={styles.createPane}>
              <TextInput
                style={styles.input}
                value={artist}
                onChangeText={setArtist}
                placeholder="artist name (required)"
                placeholderTextColor={Colors.textMuted}
              />
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="title (optional)"
                placeholderTextColor={Colors.textMuted}
              />
              <Pressable style={styles.pickBtn} onPress={pickImage}>
                {imageUri ? (
                  <Image source={{ uri: imageUri }} style={styles.pickPreview} contentFit="cover" />
                ) : (
                  <Text style={styles.pickBtnText}>pick the art image</Text>
                )}
              </Pressable>
              <Pressable
                style={[styles.submitBtn, (!artist.trim() || !imageUri) && styles.submitBtnDisabled]}
                onPress={create}
              >
                <Text style={styles.submitBtnText}>add & link</Text>
              </Pressable>
            </View>
          )}
        </View>
      </Reanimated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    // Height is fixed inline (see cardHeight) so filtering results down never
    // shrinks the dialog and connect/create are the same size.
    width: '86%',
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.mainBg,
    padding: 14,
  },
  heading: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.sm,
    marginBottom: 10,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  tab: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    paddingVertical: 6,
  },
  tabActive: {
    backgroundColor: Colors.primaryGold,
  },
  tabText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    height: 36,
    paddingHorizontal: 10,
    fontSize: 14,
    marginBottom: 8,
  },
  results: {
    flex: 1,
  },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  resultThumb: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.artCardBg,
  },
  resultGlyphWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.secondary,
  },
  resultGlyph: {
    width: 26,
    height: 26,
  },
  resultText: {
    flex: 1,
  },
  resultTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
  },
  resultByline: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.tiny,
    color: Colors.textMuted,
  },
  createPane: {
    flex: 1,
    gap: 2,
  },
  pickBtn: {
    borderWidth: 1,
    borderColor: '#000',
    borderStyle: 'dashed',
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    overflow: 'hidden',
  },
  pickPreview: {
    width: '100%',
    height: '100%',
  },
  pickBtnText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
  },
  submitBtn: {
    // Pinned to the card's bottom edge so it stays visible however the pane
    // above it lays out (and however little room the keyboard leaves).
    marginTop: 'auto',
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.primaryGold,
    alignItems: 'center',
    paddingVertical: 8,
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
  },
});
