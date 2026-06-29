// OTA build-#8 compatibility shim — see metro.config.js.
// Stands in for expo-document-picker (native module absent from the live
// binary). Always resolves as "cancelled" so the upload flows no-op gracefully
// instead of crashing; real file picking returns with a native rebuild.

export type DocumentPickerResult = {
  canceled: boolean;
  assets: null;
  // Legacy-shape fields kept so older call sites reading `.type` still work.
  type: 'cancel';
  output?: null;
};

export async function getDocumentAsync(_options?: unknown): Promise<DocumentPickerResult> {
  return { canceled: true, assets: null, type: 'cancel', output: null };
}
