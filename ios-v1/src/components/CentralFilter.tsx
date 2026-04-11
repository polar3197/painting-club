import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Dropdown from './Dropdown';
import { Colors, Fonts, FontSizes } from '../constants/theme';

interface CentralFilterProps {
  header: string;
  options: string[];
  onSearch: (value: string) => void;
  placeholder: string;
}

export default function CentralFilter({ header, options, onSearch, placeholder }: CentralFilterProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.header}>{header}</Text>
      <View style={styles.dropdown}>
        <Dropdown
          placeholder={placeholder}
          options={options}
          onSelect={onSearch}
          onInputChange={onSearch}
        />
      </View>
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
});
