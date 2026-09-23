import React, { useMemo } from 'react';
import { View } from 'react-native';
import qrcode from 'qrcode-generator';

// Pure-JS QR renderer: encodes `value` into a module matrix (qrcode-generator,
// zero native deps → ships over OTA) and paints it as a grid of Views. No SVG,
// no bitmap, so it needs nothing in the native binary.
export default function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const { cells, cell } = useMemo(() => {
    const qr = qrcode(0, 'M'); // type 0 = auto-fit, error-correction M
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    const rows: boolean[][] = [];
    for (let r = 0; r < n; r++) {
      const row: boolean[] = [];
      for (let c = 0; c < n; c++) row.push(qr.isDark(r, c));
      rows.push(row);
    }
    return { cells: rows, cell: size / n };
  }, [value, size]);

  return (
    <View style={{ width: size, height: size, backgroundColor: '#fff' }}>
      {cells.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', height: cell }}>
          {row.map((dark, c) => (
            <View
              key={c}
              style={{ width: cell, height: cell, backgroundColor: dark ? '#000' : '#fff' }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
