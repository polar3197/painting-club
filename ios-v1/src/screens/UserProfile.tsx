import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  Alert,
  Dimensions,
  LayoutChangeEvent,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation, useIsFocused } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../hooks';
import * as ImagePicker from 'expo-image-picker';
import {
  get_members_visual_2d,
  remove_visual_2d,
  update_profile,
  add_member_media,
  get_search_options,
  resolveImageUrl,
  thumbUrl,
  profileThumbUrl,
  upload_profile_picture,
  Visual2DOut,
  Profile,
} from '../api';
import Dropdown from '../components/Dropdown';
import ArtZoomIn from '../components/ArtZoomIn';
import ArtComments from '../components/ArtComments';
import AddArtDialog from '../components/AddArtDialog';
import AddMediaDialog from '../components/AddMediaDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import { Colors, Fonts, FontSizes, Shadows } from '../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type ProfileRoute = RouteProp<
  { UserProfile: { username: string; artId?: string; medium?: string } },
  'UserProfile'
>;

// --- Visual2DPiece sub-component ---
function Visual2DPiece({
  isOwner,
  piece,
  onRemove,
  onEdit,
  onLayout,
}: {
  isOwner: boolean;
  piece: Visual2DOut;
  onRemove: () => void;
  onEdit: () => void;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const { token } = useAuth();
  const [isZoomedIn, setIsZoomedIn] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  // Use the server-provided canonical aspect ratio (captured at upload). No image
  // measurement, no drift from thumbnail pixel rounding.
  const aspectRatio = piece.aspect_ratio ?? 1;

  const removeArt = async () => {
    await remove_visual_2d(piece.id, token);
    setShowRemoveConfirm(false);
    onRemove();
  };

  return (
    <>
      <ConfirmDialog
        visible={showRemoveConfirm}
        title="u sure?"
        confirmLabel="yes"
        cancelLabel="no. shit. stop"
        confirmColor={Colors.greenBright}
        cancelColor={Colors.redLight}
        confirmTextColor={Colors.black}
        cancelTextColor={Colors.black}
        onConfirm={removeArt}
        onCancel={() => setShowRemoveConfirm(false)}
      />
      {isZoomedIn && (
        <ArtZoomIn
          isOwner={isOwner}
          imgPath={piece.file_path}
          onClose={() => setIsZoomedIn(false)}
        />
      )}
      {showComments && (
        <ArtComments piece={piece} onClose={() => setShowComments(false)} />
      )}
      <View style={styles.artElement} onLayout={onLayout}>
        <Pressable
          style={({ pressed }) => [styles.artVisual, pressed && { opacity: 0.9 }]}
          onPress={() => setIsZoomedIn(true)}
        >
          <View style={[styles.artVisualInner, { aspectRatio }]}>
            <Image
              source={{ uri: resolveImageUrl(piece.file_path) }}
              placeholder={{ uri: thumbUrl(piece.id) }}
              transition={200}
              style={styles.artImage}
              contentFit="contain"
            />
          </View>
        </Pressable>
        <View style={styles.artDetails}>
          <Text style={styles.artTitle}>{piece.title}</Text>
          {!!piece.date && <Text style={styles.artDetailText}>{piece.date}</Text>}
          {!!piece.location && (
            <View style={styles.artDetailRow}>
              <Image source={require('../../assets/imgs/location.png')} style={styles.detailIcon} />
              <Text style={styles.artDetailText}>{piece.location}</Text>
            </View>
          )}
          {!!piece.song && (
            <View style={styles.artDetailRow}>
              <Image source={require('../../assets/imgs/music.png')} style={styles.detailIcon} />
              <Text style={styles.artDetailText}>
                {[piece.song, piece.song_artist].filter(Boolean).join(', ')}
              </Text>
            </View>
          )}
          {!!piece.width && !!piece.height && (
            <View style={styles.artDetailRow}>
              <Image source={require('../../assets/imgs/dimensions.png')} style={styles.detailIcon} />
              <Text style={styles.artDetailText}>
                {piece.width}"x{piece.height}"
              </Text>
            </View>
          )}
          {piece.keywords && piece.keywords.length > 0 && (
            <Text style={styles.artDetailText}>
              <Text style={{ fontWeight: '700' }}>keywords: </Text>
              {piece.keywords.join(', ')}
            </Text>
          )}
          <View style={styles.artFooter}>
            {isOwner ? (
              <View style={styles.artButtons}>
                <Pressable style={[styles.artBtn, styles.editBtn]} onPress={onEdit}>
                  <Text style={styles.artBtnText}>edit</Text>
                </Pressable>
                {piece.comments_enabled && (
                  <Pressable
                    style={[styles.artBtn, styles.commentsBtn]}
                    onPress={() => setShowComments(true)}
                  >
                    <Text style={styles.artBtnText}>comments</Text>
                  </Pressable>
                )}
                <Pressable style={[styles.artBtn, styles.removeBtn]} onPress={() => setShowRemoveConfirm(true)}>
                  <Text style={styles.artBtnText}>remove</Text>
                </Pressable>
              </View>
            ) : (
              piece.comments_enabled && (
                <View style={styles.artButtons}>
                  <Pressable
                    style={[styles.artBtn, styles.commentsBtn]}
                    onPress={() => setShowComments(true)}
                  >
                    <Text style={styles.artBtnText}>comments</Text>
                  </Pressable>
                </View>
              )
            )}
          </View>
        </View>
      </View>
    </>
  );
}

// --- Main UserProfile screen ---
export default function UserProfile() {
  const insets = useSafeAreaInsets();
  const route = useRoute<ProfileRoute>();
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const { currentUser, token } = useAuth();

  const params = route.params as { username?: string; artId?: string; medium?: string } | undefined;
  const username = params?.username || currentUser || '';
  const scrollToArtId = params?.artId;
  const mediumParam = params?.medium;

  const [profile, setProfile, error, loading, refetchProfile] = useProfile(username);
  const [selectedMedium, setSelectedMedium] = useState<string | null>(mediumParam ?? null);
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [availableKeywords, setAvailableKeywords] = useState<string[]>([]);
  const [art, setArt] = useState<Visual2DOut[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetchProfile();
      setRefresh((r) => r + 1);
    } catch {}
    setRefreshing(false);
  }, [refetchProfile]);
  const [editingPiece, setEditingPiece] = useState<Visual2DOut | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showAddMedia, setShowAddMedia] = useState(false);
  const [profileZoom, setProfileZoom] = useState(false);

  const handleAddMedia = useCallback(async (name: string) => {
    if (!profile) return;
    try {
      await add_member_media(username, name, token);
      setProfile({ ...profile, media: [...(profile.media ?? []), name] });
      setSelectedMedium(name);
      setSelectedKeywords([]);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  }, [profile, username, token]);

  const handleMediaVisibilityChange = useCallback((name: string, hiddenNow: boolean) => {
    if (!profile) return;
    const media = [...(profile.media ?? [])];
    const hidden = [...(profile.hidden_media ?? [])];
    if (hiddenNow) {
      const i = media.indexOf(name);
      if (i >= 0) media.splice(i, 1);
      if (!hidden.includes(name)) hidden.push(name);
    } else {
      const i = hidden.indexOf(name);
      if (i >= 0) hidden.splice(i, 1);
      if (!media.includes(name)) media.push(name);
    }
    setProfile({ ...profile, media, hidden_media: hidden });
    if (hiddenNow && selectedMedium === name) {
      setSelectedMedium(media[0] ?? null);
      setSelectedKeywords([]);
    }
  }, [profile, selectedMedium]);

  const pickAndUploadProfilePic = async () => {
    if (!profile) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const name = asset.uri.split('/').pop() || 'pic.jpg';
    const type = asset.mimeType || 'image/jpeg';
    const res = await upload_profile_picture({ uri: asset.uri, name, type }, token);
    setProfile({ ...profile, profile_pic_path: res.profile_pic_path });
    setProfileZoom(false);
  };

  const scrollRef = useRef<ScrollView>(null);
  const artPositions = useRef<Record<string, number>>({});
  const artSectionY = useRef(0);
  const mediaBarY = useRef(0);
  const keywordsBarY = useRef(0);
  const [pendingScroll, setPendingScroll] = useState<string | null>(scrollToArtId ?? null);

  const handleKeywordFocus = useCallback(() => {
    // Put the keyword bar near the top of the visible area so it (and the
    // dropdown list underneath) stays in view when the keyboard pops up.
    const target = Math.max(0, mediaBarY.current + keywordsBarY.current - 20);
    // Delay so the keyboard has started animating up before we scroll.
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: target, animated: true });
    }, 50);
  }, []);

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [editBio, setEditBio] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editState, setEditState] = useState('');

  useEffect(() => {
    if (!mediumParam && profile?.media?.[0]) {
      setSelectedMedium(profile.media[0]);
    }
  }, [profile]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('tabPress', () => {
      if (isFocused) {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }
    });
    return unsubscribe;
  }, [navigation, isFocused]);

  // Fetch art
  useEffect(() => {
    if (!selectedMedium || !username) return;
    const isV2d =
      selectedMedium === 'painting' ||
      selectedMedium === 'drawing' ||
      selectedMedium === 'stained glass' ||
      selectedMedium === 'photography';
    if (isV2d) {
      get_members_visual_2d(username, selectedMedium)
        .then((data) => {
          setArt(data);
          const unique = [...new Set(data.flatMap((p) => p.keywords ?? []))];
          setAvailableKeywords(unique);
        })
        .catch(() => {
          setArt([]);
          setAvailableKeywords([]);
        });
    } else {
      setArt([]);
      setAvailableKeywords([]);
    }
  }, [username, selectedMedium, refresh]);

  const filteredArt = useMemo(() => {
    if (selectedKeywords.length === 0) return art;
    return art.filter((p) => selectedKeywords.every((k) => p.keywords?.includes(k)));
  }, [art, selectedKeywords]);

  const handleArtLayout = useCallback((pieceId: string, e: LayoutChangeEvent) => {
    const y = e.nativeEvent.layout.y + artSectionY.current;
    artPositions.current[pieceId] = y;
    if (pendingScroll && pieceId === pendingScroll) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y, animated: true });
        setPendingScroll(null);
      }, 300);
    }
  }, [pendingScroll]);

  const startEditing = () => {
    if (!profile) return;
    setEditBio(profile.bio || '');
    setEditCity(profile.city || '');
    setEditState(profile.state || '');
    setEditing(true);
  };

  const submitEdit = async () => {
    if (!profile) return;
    try {
      const updated = { ...profile, bio: editBio, city: editCity, state: editState };
      await update_profile(username, updated, token);
      setProfile(updated);
      setEditing(false);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  if (loading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }
  if (error || !profile) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.loadingText}>Something went wrong</Text>
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={styles.contentContainer}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={Colors.darkerGold}
          colors={[Colors.darkerGold]}
        />
      }
    >
      {/* Profile zoom */}
      {profileZoom && profile.profile_pic_path && (
        <ArtZoomIn
          isOwner={profile.is_owner}
          imgPath={profile.profile_pic_path}
          onClose={() => setProfileZoom(false)}
          onChangePic={profile.is_owner ? pickAndUploadProfilePic : undefined}
        />
      )}

      {/* Add/Edit dialog */}
      {showAddDialog && selectedMedium && (
        <AddArtDialog
          selectedMedium={selectedMedium}
          username={username}
          onSuccess={() => setRefresh((r) => r + 1)}
          onClose={() => setShowAddDialog(false)}
        />
      )}
      {editingPiece && selectedMedium && (
        <AddArtDialog
          selectedMedium={selectedMedium}
          username={username}
          onSuccess={() => setRefresh((r) => r + 1)}
          onClose={() => setEditingPiece(null)}
          onMoved={(newMedium) => {
            setProfile((p) => (p && !p.media.includes(newMedium) ? { ...p, media: [...p.media, newMedium] } : p));
            setSelectedMedium(newMedium);
            setSelectedKeywords([]);
          }}
          piece={editingPiece}
        />
      )}
      {showAddMedia && (
        <AddMediaDialog
          shown={profile.media ?? []}
          hidden={profile.hidden_media ?? []}
          onAdd={handleAddMedia}
          onVisibilityChange={handleMediaVisibilityChange}
          onClose={() => setShowAddMedia(false)}
        />
      )}

      {/* ---- UserDetails ---- */}
      <View style={styles.userDetails}>
        <Pressable
          style={styles.userFields}
          onPress={profile.is_owner && !editing ? startEditing : undefined}
        >
          {!editing ? (
            <>
              <View style={styles.userTopRow}>
                <View style={styles.userIdentity}>
                  <Text style={styles.userName}>
                    {profile.firstname} {profile.lastname}
                  </Text>
                  {(profile.city || profile.state) && (
                    <Text style={styles.userLocation}>
                      {[profile.city, profile.state].filter(Boolean).join(', ')}
                    </Text>
                  )}
                  {selectedMedium && (
                    <Pressable
                      style={styles.portfolioLink}
                      onPress={() =>
                        navigation.navigate('Portfolio', {
                          username,
                          medium: selectedMedium,
                          keywords: selectedKeywords,
                        })
                      }
                    >
                      <Text style={styles.portfolioLinkText}>portfolio view</Text>
                    </Pressable>
                  )}
                </View>
                {profile.profile_pic_path ? (
                  <Pressable onPress={() => setProfileZoom(true)} style={styles.profilePicContainer}>
                    <Image
                      source={{ uri: resolveImageUrl(profile.profile_pic_path) }}
                      placeholder={{ uri: profileThumbUrl(profile.id) }}
                      transition={200}
                      priority="high"
                      style={styles.profilePic}
                      contentFit="cover"
                    />
                  </Pressable>
                ) : profile.is_owner ? (
                  <Pressable onPress={pickAndUploadProfilePic} style={styles.profilePicContainer}>
                    <View style={[styles.profilePic, styles.profilePicEmpty]}>
                      <Text style={styles.profilePicPlus}>add prof pic</Text>
                    </View>
                  </Pressable>
                ) : (
                  <View style={styles.profilePicContainer}>
                    <View style={[styles.profilePic, styles.profilePicEmpty]} />
                  </View>
                )}
              </View>
              {!!profile.bio && (
                <View style={styles.bioSection}>
                  <Text style={styles.bioLabel}>Artist Statement</Text>
                  <View style={styles.bioHr} />
                  <Text style={styles.bioText}>{profile.bio}</Text>
                </View>
              )}
            </>
          ) : (
            <>
              <TextInput
                style={styles.editNameInput}
                value={profile.firstname}
                placeholder="firstname"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                onChangeText={(v) => setProfile({ ...profile!, firstname: v })}
              />
              <TextInput
                style={styles.editNameInput}
                value={profile.lastname}
                placeholder="lastname"
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                onChangeText={(v) => setProfile({ ...profile!, lastname: v })}
              />
              <View style={styles.editLocationRow}>
                <TextInput
                  style={[styles.editInput, { flex: 3 }]}
                  value={editCity}
                  onChangeText={setEditCity}
                  placeholder="city"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                />
                <TextInput
                  style={[styles.editInput, { flex: 1 }]}
                  value={editState}
                  onChangeText={setEditState}
                  placeholder="state"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                />
              </View>
              <Text style={styles.bioLabel}>artist statement</Text>
              <TextInput
                style={[styles.editInput, { minHeight: 120, textAlignVertical: 'top' }]}
                value={editBio}
                onChangeText={setEditBio}
                autoCapitalize="none"
                placeholder="write a bio"
                placeholderTextColor={Colors.textMuted}
                multiline
              />
              <Pressable style={styles.submitEditBtn} onPress={submitEdit}>
                <Text style={styles.submitEditBtnText}>submit</Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </View>

      {/* ---- MediaBar ---- */}
      <View
        style={styles.mediaBar}
        onLayout={(e) => { mediaBarY.current = e.nativeEvent.layout.y; }}
      >
        <View style={styles.mediaTabs}>
          {profile.media?.map((m) => (
            <Pressable
              key={m}
              style={[
                styles.mediaTab,
                selectedMedium === m && styles.mediaTabSelected,
              ]}
              onPress={() => {
                setSelectedMedium(m);
                setSelectedKeywords([]);
              }}
            >
              <Text style={styles.mediaTabText}>{m}</Text>
            </Pressable>
          ))}
          {profile.is_owner && (
            <Pressable
              style={[
                styles.addMediaBtn,
                (profile.media?.length ?? 0) === 0 && styles.addMediaBtnFull,
              ]}
              onPress={() => setShowAddMedia(true)}
            >
              <Text style={styles.addMediaBtnText}>+/-</Text>
            </Pressable>
          )}
        </View>

        {/* Keywords sub-bar */}
        <View
          style={styles.keywordsBar}
          onLayout={(e) => { keywordsBarY.current = e.nativeEvent.layout.y; }}
        >
            <View style={styles.keywordDropdown}>
              <Dropdown
                placeholder="keyword"
                options={availableKeywords.filter((k) => !selectedKeywords.includes(k))}
                onSelect={(k) => {
                  if (!selectedKeywords.includes(k)) {
                    setSelectedKeywords([...selectedKeywords, k]);
                  }
                }}
                onFocus={handleKeywordFocus}
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.keywordBubbles}>
              {selectedKeywords.map((k) => (
                <View key={k} style={styles.keywordBubble}>
                  <Text style={styles.keywordBubbleText}>{k}</Text>
                  <Pressable
                    onPress={() => setSelectedKeywords(selectedKeywords.filter((sk) => sk !== k))}
                  >
                    <Text style={styles.keywordRemove}>x</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
        </View>
      </View>

      {/* ---- Art Section ---- */}
      <View
        style={styles.artSection}
        onLayout={(e) => { artSectionY.current = e.nativeEvent.layout.y; }}
      >
        {profile.is_owner && (
          <Pressable style={styles.addBtn} onPress={() => setShowAddDialog(true)}>
            <Text style={styles.addBtnText}>+</Text>
          </Pressable>
        )}

        {selectedMedium &&
        (selectedMedium === 'painting' ||
          selectedMedium === 'drawing' ||
          selectedMedium === 'stained glass' ||
          selectedMedium === 'photography') ? (
          filteredArt.map((piece) => (
            <Visual2DPiece
              key={piece.id}
              isOwner={profile.is_owner}
              piece={piece}
              onRemove={() => setRefresh((r) => r + 1)}
              onEdit={() => setEditingPiece(piece)}
              onLayout={(e) => handleArtLayout(piece.id, e)}
            />
          ))
        ) : (
          <Text style={styles.emptyText}>{selectedMedium} is empty atm</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.mainBg,
  },
  contentContainer: {
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.mainBg,
  },
  loadingText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
  },

  // UserDetails
  userDetails: {
    flexDirection: 'column',
    alignItems: 'center',
    padding: 10,
    paddingHorizontal: 20,
    gap: 12,
  },
  userFields: {
    width: '100%',
    padding: 10,
  },
  userName: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
  },
  userLocation: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    marginTop: 2,
  },
  bioSection: {
    marginTop: 12,
    marginHorizontal: -8,
    borderWidth: 1,
    borderColor: '#000',
    borderRadius: 5,
    padding: 10,
  },
  bioLabel: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.md,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 4,
  },
  bioHr: {
    height: 1,
    backgroundColor: '#000',
    marginBottom: 8,
  },
  bioText: {
    fontWeight: '300',
    lineHeight: 22,
  },
  editNameInput: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    paddingVertical: 4,
    marginBottom: 4,
  },
  editLocationRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  editInput: {
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    paddingVertical: 6,
  },
  submitEditBtn: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'lightgreen',
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  submitEditBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
  },
  portfolioLink: {
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  portfolioLinkText: {
    fontSize: FontSizes.xxs,
  },
  userTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  userIdentity: {
    flex: 1,
    gap: 4,
  },
  profilePicContainer: {
    width: SCREEN_WIDTH * 0.32,
  },
  profilePic: {
    width: '100%',
    aspectRatio: 1,
    borderWidth: 5,
    borderColor: Colors.primaryGold,
    borderRadius: 5,
  },
  profilePicEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  profilePicPlus: {
    fontFamily: Fonts.serif,
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },

  // MediaBar
  mediaBar: {
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  mediaTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    width: '100%',
  },
  mediaTab: {
    width: '48%',
    alignItems: 'center',
    backgroundColor: Colors.secondary,
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  mediaTabSelected: {
    backgroundColor: Colors.primaryGold,
  },
  mediaTabText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
  },
  addMediaBtn: {
    width: '48%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.secondary,
    borderWidth: 1,
    borderColor: '#000',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  addMediaBtnFull: {
    width: '100%',
  },
  addMediaBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    fontWeight: '600',
  },
  keywordsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  keywordDropdown: {
    width: '25%',
    marginRight: 8,
  },
  keywordBubbles: {
    flexDirection: 'row',
  },
  keywordBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.accentGolden,
    borderWidth: 2,
    borderColor: Colors.blue,
    borderRadius: 15,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 6,
  },
  keywordBubbleText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.tiny,
    marginRight: 4,
  },
  keywordRemove: {
    fontSize: FontSizes.tiny,
    fontWeight: '700',
    color: Colors.textSecondary,
  },

  // Art Section
  artSection: {
    padding: 16,
  },
  addBtn: {
    width: 25,
    height: 25,
    borderRadius: 9999,
    backgroundColor: Colors.secondary,
    borderWidth: 1,
    borderColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    alignSelf: 'flex-end',
  },
  addBtnText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  emptyText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.textTertiary,
    padding: 20,
  },

  // Art element
  artElement: {
    marginBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    paddingBottom: 16,
  },
  artVisual: {
    width: '100%',
    marginBottom: 10,
    borderWidth: 2,
    borderColor: '#000',
  },
  artVisualInner: {
    width: '100%',
  },
  artImage: {
    width: '100%',
    height: '100%',
  },
  artDetails: {
    paddingHorizontal: 4,
  },
  artTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xxl,
    marginBottom: 6,
  },
  artDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  detailIcon: {
    width: 24,
    height: 24,
    marginRight: 6,
  },
  artDetailText: {
    fontSize: FontSizes.xs,
    marginBottom: 4,
  },
  artFooter: {
    marginTop: 10,
  },
  artButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  artBtn: {
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  artBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
  },
  editBtn: {
    backgroundColor: Colors.greenBright,
  },
  commentsBtn: {
    backgroundColor: Colors.secondary,
  },
  removeBtn: {
    backgroundColor: Colors.redLight,
  },
});
