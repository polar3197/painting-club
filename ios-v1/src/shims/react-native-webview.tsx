// OTA build-#8 compatibility shim — see metro.config.js.
// Stands in for react-native-webview (native view absent from the live binary).
// Renders an empty View and exposes no-op imperative methods so the written-form
// reader degrades gracefully (blank canvas, no crash) until a native rebuild.
import React from 'react';
import { View, ViewProps } from 'react-native';

export type WebViewMessageEvent = { nativeEvent: { data: string } };

type WebViewProps = ViewProps & {
  source?: unknown;
  onMessage?: (e: WebViewMessageEvent) => void;
  [key: string]: unknown;
};

export const WebView = React.forwardRef<unknown, WebViewProps>(({ style }, ref) => {
  React.useImperativeHandle(ref, () => ({
    injectJavaScript(_script: string) {},
    reload() {},
    postMessage(_msg: string) {},
    stopLoading() {},
    goBack() {},
    goForward() {},
  }));
  return <View style={style as ViewProps['style']} />;
});

export default WebView;

// Lets OTA code detect it's running against the stub (real module lacks this)
// and keep the "open file" fallback instead of rendering a blank canvas.
export const IS_STUB = true;
