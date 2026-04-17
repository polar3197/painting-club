import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Dimensions,
  Animated,
  PanResponder,
  Alert,
  Image as RNImage,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { get_comments, post_comment, delete_comment, resolveImageUrl, thumbUrl, Visual2DOut, CommentOut } from '../api';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import ConfirmDialog from './ConfirmDialog';

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const IMG_SECTION_HEIGHT = SCREEN_HEIGHT * 0.4;
const MAX_IMG_WIDTH = SCREEN_WIDTH - 20;
const MAX_IMG_HEIGHT = IMG_SECTION_HEIGHT - 20;

function computeImgSize(ratio: number) {
  let w = MAX_IMG_WIDTH;
  let h = w / ratio;
  if (h > MAX_IMG_HEIGHT) {
    h = MAX_IMG_HEIGHT;
    w = h * ratio;
  }
  return { width: w, height: h };
}

interface ArtCommentsProps {
  piece: Visual2DOut;
  onClose: () => void;
}

export default function ArtComments({ piece, onClose }: ArtCommentsProps) {
  const { currentUser, token } = useAuth();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [comments, setComments] = useState<CommentOut[]>([]);
  const [input, setInput] = useState('');
  const [imgRatio, setImgRatio] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<CommentOut | null>(null);
  const translateY = useRef(new Animated.Value(0)).current;

  const imgUri = resolveImageUrl(piece.file_path);
  useEffect(() => {
    RNImage.getSize(imgUri, (w, h) => { if (h > 0) setImgRatio(w / h); }, () => {});
  }, [imgUri]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 10,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 100) {
          Animated.timing(translateY, { toValue: SCREEN_HEIGHT, duration: 200, useNativeDriver: true }).start(onClose);
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    get_comments(piece.id, token).then(setComments).catch(() => {});
  }, [piece.id]);

  const submit = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    try {
      const newComment = await post_comment(piece.id, text, token);
      setComments((prev) => [...prev, newComment]);
    } catch (err: any) {
      // Don't fabricate a local comment — that creates the illusion of success
      // while the server never received it. Restore the text and surface the error.
      setInput(text);
      Alert.alert('Comment failed', err?.message || 'Could not post your comment');
    }
  };

  const navigateToUser = (username: string) => {
    onClose();
    navigation.navigate('UserProfile', { username });
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    try {
      await delete_comment(piece.id, id, token);
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch (err: any) {
      Alert.alert('Delete failed', err?.message || 'Could not delete comment');
    }
  };

  const renderComment = ({ item: c }: { item: CommentOut }) => {
    const isOwn = c.username === currentUser;
    const display = c.firstname || c.username;
    return (
      <View style={[styles.commentRow, isOwn ? styles.commentRowOwn : styles.commentRowOther]}>
        {!isOwn && (
          <Pressable style={styles.commentLabel} onPress={() => navigateToUser(c.username)}>
            <Text style={styles.commentLabelName}>{display} {'>'}</Text>
            {c.firstname && <Text style={styles.commentLabelUsername}>@{c.username}</Text>}
          </Pressable>
        )}
        <Pressable
          style={styles.commentBubble}
          onLongPress={isOwn ? () => setPendingDelete(c) : undefined}
          delayLongPress={400}
        >
          <Text style={styles.commentText}>{c.text}</Text>
        </Pressable>
        {isOwn && (
          <View style={styles.commentLabel}>
            <Text style={styles.commentLabelName}>{'<'}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <ConfirmDialog
        visible={pendingDelete !== null}
        title="delete cmt?"
        message={pendingDelete ? `"${pendingDelete.text}"` : ''}
        confirmLabel="delete"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Animated.View style={[styles.panel, { transform: [{ translateY }] }]}>
          <View {...panResponder.panHandlers}>
            <View style={styles.swipeHandle}>
              <View style={styles.swipeBar} />
            </View>
            <View style={styles.imageSection}>
              <Image
                source={{ uri: imgUri }}
                placeholder={{ uri: thumbUrl(piece.id) }}
                transition={200}
                style={[styles.image, computeImgSize(imgRatio)]}
                contentFit="contain"
              />
            </View>
          </View>
          <View style={styles.commentsSection}>
            <View style={styles.headerRow}>
              <Text style={styles.header}>{piece.title}</Text>
              <Pressable style={styles.closeBtn} onPress={onClose}>
                <Text style={styles.closeBtnText}>x</Text>
              </Pressable>
            </View>
            <FlatList
              data={comments}
              keyExtractor={(c) => c.id}
              renderItem={renderComment}
              style={styles.list}
              contentContainerStyle={styles.listContent}
            />
            <View style={[styles.inputBar, { paddingBottom: 8 + insets.bottom }]}>
              <TextInput
                style={styles.input}
                value={input}
                placeholder="go for it. comment..."
                placeholderTextColor={Colors.textMuted}
                autoCapitalize="none"
                onChangeText={setInput}
                onSubmitEditing={submit}
                returnKeyType="send"
              />
              <Pressable style={styles.submitBtn} onPress={submit}>
                <Text style={styles.submitText}>{'↑'}</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backdrop: {
    height: 40,
    backgroundColor: Colors.overlay,
  },
  panel: {
    flex: 1,
    backgroundColor: Colors.white,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    overflow: 'hidden',
  },
  swipeHandle: {
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: Colors.mainBg,
  },
  swipeBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.textMuted,
  },
  imageSection: {
    height: IMG_SECTION_HEIGHT,
    backgroundColor: Colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  image: {
    borderWidth: 1,
    borderColor: '#000',
  },
  commentsSection: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    paddingRight: 8,
  },
  header: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.md,
    padding: 12,
    flex: 1,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.mainBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 10,
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  commentRowOwn: {
    justifyContent: 'flex-end',
  },
  commentRowOther: {
    justifyContent: 'flex-start',
  },
  commentLabel: {
    marginHorizontal: 6,
    marginBottom: 2,
  },
  commentLabelName: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    fontWeight: '600',
    color: Colors.black,
  },
  commentLabelUsername: {
    fontSize: FontSizes.micro,
    color: Colors.textMuted,
  },
  commentBubble: {
    backgroundColor: Colors.secondary,
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: '70%',
  },
  commentText: {
    fontFamily: Fonts.serif,
    fontSize: 15,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#000',
    padding: 8,
  },
  input: {
    flex: 1,
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  submitBtn: {
    width: 24,
    height: 24,
    backgroundColor: Colors.greenBright,
    borderWidth: 1,
    borderColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  submitText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
