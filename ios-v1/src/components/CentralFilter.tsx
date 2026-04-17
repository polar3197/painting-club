import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import Dropdown from './Dropdown';
import { Colors, Fonts, FontSizes } from '../constants/theme';

interface CentralFilterProps {
  header: string;
  options: string[];
  chips: string[];
  onAddChip: (value: string) => void;
  onRemoveChip: (value: string) => void;
  onQueryChange: (value: string) => void;
  placeholder: string;
}

export default function CentralFilter({
  header,
  options,
  chips,
  onAddChip,
  onRemoveChip,
  onQueryChange,
  placeholder,
}: CentralFilterProps) {
  const availableOptions = options.filter((o) => !chips.includes(o));
  return (
    <View>
      <View style={styles.container}>
        <Text style={styles.header}>{header}</Text>
        <View style={styles.dropdown}>
          <Dropdown
            placeholder={placeholder}
            options={availableOptions}
            onSelect={(value) => {
              onAddChip(value);
              onQueryChange('');
            }}
            onInputChange={onQueryChange}
          />
        </View>
      </View>
      {chips.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsRow}
          contentContainerStyle={styles.chipsContent}
          keyboardShouldPersistTaps="handled"
        >
          {chips.map((chip) => (
            <View key={chip} style={styles.chip}>
              <Text style={styles.chipText}>{chip}</Text>
              <Pressable onPress={() => onRemoveChip(chip)} hitSlop={6}>
                <Text style={styles.chipRemove}>x</Text>
              </Pressable>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    backgroundColor: Colors.mainBg,
    height: 80,
    paddingHorizontal: 30,
  },
  header: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
    color: Colors.textPrimary,
  },
  dropdown: {
    width: '60%',
  },
  chipsRow: {
    backgroundColor: Colors.mainBg,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  chipsContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
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
  chipText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.tiny,
    marginRight: 6,
  },
  chipRemove: {
    fontSize: FontSizes.tiny,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
});
