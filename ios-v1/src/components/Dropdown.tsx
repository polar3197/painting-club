import React, { useState, useRef, useEffect } from 'react';
import { View, TextInput, ScrollView, Pressable, Text, StyleSheet, Keyboard } from 'react-native';
import Fuse from 'fuse.js';
import { Colors } from '../constants/theme';

interface DropdownProps {
  placeholder: string;
  options: string[];
  onSelect: (value: string) => void;
  onInputChange?: (value: string) => void;
}

export default function Dropdown({ placeholder, options, onSelect, onInputChange }: DropdownProps) {
  const [query, setQuery] = useState('');
  const [showList, setShowList] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const fuseRef = useRef(new Fuse(options, { threshold: 0.4 }));

  // Update fuse when options change
  React.useEffect(() => {
    fuseRef.current = new Fuse(options, { threshold: 0.4 });
  }, [options]);

  // Close the list whenever the keyboard dismisses (e.g. from scroll-to-dismiss on the parent ScrollView)
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidHide', () => {
      setShowList(false);
      inputRef.current?.blur();
    });
    return () => sub.remove();
  }, []);

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
        onChangeText={handleChange}
        onFocus={() => setShowList(true)}
        onBlur={() => setTimeout(() => setShowList(false), 150)}
        onPressIn={() => {
          if (showList) {
            setShowList(false);
            inputRef.current?.blur();
          } else {
            setShowList(true);
          }
        }}
      />
      {showList && filtered.length > 0 && (
        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
          {filtered.map((item, i) => (
            <Pressable key={`${item}-${i}`} style={styles.item} onPress={() => handleSelect(item)}>
              <Text style={styles.itemText}>{item}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

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
    top: 31,
    left: 0,
    right: 0,
    maxHeight: 200,
    backgroundColor: Colors.secondary,
    borderWidth: 1,
    borderColor: '#000',
    zIndex: 20,
  },
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
