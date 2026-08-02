import React, { useState, useRef, useImperativeHandle, forwardRef } from 'react';
import { View, ScrollView, Pressable, Text, StyleSheet } from 'react-native';
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
}

export interface DropdownHandle {
  close: () => void;
}

const Dropdown = forwardRef<DropdownHandle, DropdownProps>(function Dropdown(
  { placeholder, options, onSelect, onInputChange, onFocus, openUp },
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

  const close = React.useCallback(() => {
    setShowList(false);
    inputRef.current?.blur();
  }, []);

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
          setShowList(true);
          onFocus?.();
        }}
        onBlur={() => setTimeout(() => setShowList(false), 150)}
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
