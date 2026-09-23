import React, { useState, useRef, useImperativeHandle, forwardRef } from 'react';
import { View, ScrollView, Pressable, Text, StyleSheet, Keyboard } from 'react-native';
import { TextInput } from './AppTextInput';
import { useFocusEffect } from '@react-navigation/native';
import Fuse from 'fuse.js';
import { Colors } from '../constants/theme';

interface DropdownProps {
  placeholder: string;
  options: string[];
  onSelect: (value: string) => void;
  onInputChange?: (value: string) => void;
  onFocus?: () => void;
  // Open the option list ABOVE the input — for dropdowns pinned near the
  // bottom of a sheet, where a downward list would clip off-panel.
  openUp?: boolean;
  // Hold the list until the keyboard has finished sliding up. Without this a
  // dropdown that rides a keyboard-anchored sheet shows its list immediately,
  // gets overlaid by the arriving keyboard, then jumps into place.
  showAfterKeyboard?: boolean;
}

export interface DropdownHandle {
  close: () => void;
}

const Dropdown = forwardRef<DropdownHandle, DropdownProps>(function Dropdown(
  { placeholder, options, onSelect, onInputChange, onFocus, openUp, showAfterKeyboard },
  ref,
) {
  const [query, setQuery] = useState('');
  const [showList, setShowList] = useState(false);
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const fuseRef = useRef(new Fuse(options, { threshold: 0.4 }));

  // Update fuse when options change
  React.useEffect(() => {
    fuseRef.current = new Fuse(options, { threshold: 0.4 });
  }, [options]);

  // Pending "show the list once the keyboard settles" subscription + fallback
  // (fallback covers hardware keyboards, where no keyboard ever slides up).
  const deferredShow = useRef<{ sub?: { remove: () => void }; timer?: ReturnType<typeof setTimeout> }>({});
  const cancelDeferredShow = React.useCallback(() => {
    deferredShow.current.sub?.remove();
    if (deferredShow.current.timer) clearTimeout(deferredShow.current.timer);
    deferredShow.current = {};
  }, []);

  const openList = React.useCallback(() => {
    if (!showAfterKeyboard || Keyboard.isVisible()) {
      setShowList(true);
      return;
    }
    cancelDeferredShow();
    const reveal = () => {
      cancelDeferredShow();
      setShowList(true);
    };
    deferredShow.current.sub = Keyboard.addListener('keyboardDidShow', reveal);
    deferredShow.current.timer = setTimeout(reveal, 500);
  }, [showAfterKeyboard, cancelDeferredShow]);

  const close = React.useCallback(() => {
    cancelDeferredShow();
    setShowList(false);
    inputRef.current?.blur();
  }, [cancelDeferredShow]);

  useImperativeHandle(ref, () => ({ close }), [close]);

  // Close the list whenever the enclosing screen loses focus (e.g. user switches tabs)
  useFocusEffect(
    React.useCallback(() => {
      return close;
    }, [close])
  );

  const filtered = query.trim()
    ? fuseRef.current.search(query).map((r) => r.item)
    : options;

  const handleChange = (text: string) => {
    setQuery(text);
    onInputChange?.(text);
  };

  const handleSelect = (item: string) => {
    setQuery('');
    setShowList(false);
    inputRef.current?.blur();
    onSelect(item);
  };

  return (
    <View style={styles.container}>
      <TextInput
        ref={inputRef}
        style={styles.input}
        value={query}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={handleChange}
        onFocus={() => {
          openList();
          onFocus?.();
        }}
        onBlur={() => {
          cancelDeferredShow();
          setTimeout(() => setShowList(false), 150);
        }}
      />
      {showList && filtered.length > 0 && (
        <ScrollView
          style={[styles.list, openUp ? styles.listUp : styles.listDown]}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          {filtered.map((item, i) => (
            <Pressable key={`${item}-${i}`} style={styles.item} onPress={() => handleSelect(item)}>
              <Text style={styles.itemText}>{item}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
});

export default Dropdown;

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    zIndex: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#000',
    height: 30,
    paddingHorizontal: 4,
    fontSize: 14,
    backgroundColor: Colors.white,
  },
  list: {
    position: 'absolute',
    left: 0,
    right: 0,
    maxHeight: 200,
    backgroundColor: Colors.secondary,
    borderWidth: 1,
    borderColor: '#000',
    zIndex: 20,
  },
  listDown: { top: 31 },
  listUp: { bottom: 31 },
  item: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  itemText: {
    fontSize: 14,
  },
});
