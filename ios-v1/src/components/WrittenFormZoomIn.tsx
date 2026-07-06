import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Modal,
  Pressable,
  Text,
  StyleSheet,
  Linking,
  PanResponder,
} from 'react-native';
import * as WebViewModule from 'react-native-webview';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { resolveImageUrl } from '../api';
import { extFromPath, isTextExt, useWrittenFormTextState } from '../hooks';
import { Colors, Fonts, FontSizes } from '../constants/theme';

// True when this OTA bundle runs against the build-#8 WebView stub — PDFs then
// keep the "open file" fallback instead of rendering a blank canvas.
const WEBVIEW_IS_STUB = (WebViewModule as any).IS_STUB === true;

// Font-size slider config: pinned to a JS-only custom slider so we don't pull
// in @react-native-community/slider (would require another prebuild + resubmit).
const MIN_FONT = 12;
const MAX_FONT = 28;
const DEFAULT_FONT = 16;
const TRACK_WIDTH = 200;
const THUMB_SIZE = 22;
const TRAVEL = TRACK_WIDTH - THUMB_SIZE;

interface WrittenFormZoomInProps {
  title: string;
  filePath: string;
  onClose: () => void;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildHtml(text: string, initialFontPx: number, bg: string): string {
  // CSS columns flow the prose into viewport-wide pages, but we DON'T let the
  // browser handle scrolling. Native overflow-x scroll + custom snap fought
  // each other and felt jerky. Instead the reader sits in an overflow-hidden
  // frame and we drive a `transform: translateX(...)` directly from touch
  // events. Drag tracks the finger 1:1; release runs a single ease-out cubic
  // to the target page. No native scroll, no scrollbar, no scroll/snap race.
  const body = escapeHtml(text);
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; overflow: hidden; background: ${bg}; -webkit-text-size-adjust: 100%; }
  body { padding: 0; }
  #frame {
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    touch-action: pan-x;
  }
  #reader {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: var(--fs, ${initialFontPx}px);
    line-height: 1.5;
    color: #000;
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow-wrap: break-word;
    -webkit-hyphens: auto;
    hyphens: auto;
    /* Each "page" occupies exactly 100vw of horizontal layout space:
       a (100vw - 32px) column plus a 32px gap. The gap becomes the visual
       margin between successive pages (16px right of column N + 16px left
       of column N+1). This makes JS page-stride = window.innerWidth exactly,
       with no math drift to compute or rounding to mis-align. */
    column-width: calc(100vw - 32px);
    column-gap: 32px;
    column-fill: auto;
    width: 100vw;
    height: 100vh;
    padding: 0 16px;
    transform: translateX(0);
    will-change: transform;
  }
  ::-webkit-scrollbar { display: none; }
</style>
</head>
<body>
<div id="frame"><div id="reader">${body}</div></div>
<script>
  (function() {
    const frame  = document.getElementById('frame');
    const reader = document.getElementById('reader');

    let pageIdx = 0;
    let totalPages = 1;
    let translateX = 0;
    let dragStartX = 0;
    let dragStartTranslate = 0;
    let dragging = false;
    let samples = [];   // touch points for velocity
    let rafId = 0;

    // Each column + gap = 100vw by construction, so the viewport width IS the
    // page stride. No need to compute from clientWidth (which would exclude
    // the right gap of the last column and drift by gap/2 per page).
    function pageStride() { return window.innerWidth; }

    function setTranslate(x) {
      translateX = x;
      reader.style.transform = 'translateX(' + x + 'px)';
    }

    function post() {
      window.ReactNativeWebView.postMessage(JSON.stringify({ totalPages, currentPage: pageIdx }));
    }

    function measure() {
      const w = pageStride();
      // Reader width = w (one column) but content overflows horizontally into
      // additional columns. scrollWidth reports the full multi-column width
      // even though overflow is hidden — that's how we count pages.
      totalPages = Math.max(1, Math.round(reader.scrollWidth / w));
      if (pageIdx > totalPages - 1) pageIdx = totalPages - 1;
      setTranslate(-pageIdx * w);
      post();
    }

    function animateTo(target) {
      cancelAnimationFrame(rafId);
      const w = pageStride();
      const endX = -target * w;
      const startX = translateX;
      const duration = 280;
      const t0 = performance.now();
      function tick(now) {
        const t = Math.min(1, (now - t0) / duration);
        // Ease-out cubic: fast start, soft landing — matches how a page-turn
        // gesture should "release" forward into the new page.
        const k = 1 - Math.pow(1 - t, 3);
        setTranslate(startX + (endX - startX) * k);
        if (t < 1) {
          rafId = requestAnimationFrame(tick);
        } else {
          pageIdx = target;
          post();
        }
      }
      rafId = requestAnimationFrame(tick);
    }

    frame.addEventListener('touchstart', function(e) {
      cancelAnimationFrame(rafId);
      dragging = true;
      dragStartX = e.touches[0].clientX;
      dragStartTranslate = translateX;
      samples = [{ t: performance.now(), x: dragStartX }];
    }, { passive: true });

    frame.addEventListener('touchmove', function(e) {
      if (!dragging) return;
      const x = e.touches[0].clientX;
      const dx = x - dragStartX;
      // Mild rubber-banding at the document edges so it doesn't feel like
      // hitting a wall — but the finger doesn't drag the reader past either.
      let next = dragStartTranslate + dx;
      const minX = -(totalPages - 1) * pageStride();
      const maxX = 0;
      if (next > maxX) next = maxX + (next - maxX) * 0.35;
      else if (next < minX) next = minX + (next - minX) * 0.35;
      setTranslate(next);
      samples.push({ t: performance.now(), x: x });
      if (samples.length > 5) samples.shift();
    }, { passive: true });

    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      const w = pageStride();
      // Velocity from the last few samples — pixels per millisecond. Positive
      // vx means finger moved left, i.e. swipe forward to next page.
      let vx = 0;
      if (samples.length >= 2) {
        const a = samples[0];
        const b = samples[samples.length - 1];
        const dt = b.t - a.t;
        if (dt > 0) vx = (a.x - b.x) / dt;
      }
      const FLICK = 0.4;
      let target;
      if (vx > FLICK) target = pageIdx + 1;
      else if (vx < -FLICK) target = pageIdx - 1;
      else target = Math.round(-translateX / w);
      target = Math.max(0, Math.min(totalPages - 1, target));
      animateTo(target);
    }
    frame.addEventListener('touchend', endDrag, { passive: true });
    frame.addEventListener('touchcancel', endDrag, { passive: true });

    window.addEventListener('resize', measure);

    requestAnimationFrame(function() { requestAnimationFrame(measure); });

    window.setFontSize = function(px) {
      document.documentElement.style.setProperty('--fs', px + 'px');
      requestAnimationFrame(function() { requestAnimationFrame(measure); });
    };
  })();
  true;
</script>
</body>
</html>`;
}

export default function WrittenFormZoomIn({ title, filePath, onClose }: WrittenFormZoomInProps) {
  const insets = useSafeAreaInsets();
  const ext = extFromPath(filePath);
  const previewable = isTextExt(ext);
  // WKWebView renders PDFs natively (paged, pinch-zoom) — view them in-app on
  // builds with the real WebView; stub builds keep the "open file" fallback.
  const pdfInApp = ext === 'pdf' && !WEBVIEW_IS_STUB;
  const { text, error: textError, retry: retryText } = useWrittenFormTextState(filePath);
  // PDF load failures (e.g. a 502 while the server is unreachable) — without
  // this the WebView renders the raw error page inside the reader.
  const [pdfError, setPdfError] = useState(false);
  const [pdfAttempt, setPdfAttempt] = useState(0);

  const [fontSize, setFontSize] = useState(DEFAULT_FONT);
  const [totalPages, setTotalPages] = useState(1);
  const [pageIndex, setPageIndex] = useState(0);
  const webviewRef = useRef<WebView>(null);

  const fontRef = useRef(DEFAULT_FONT);
  const sliderResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (e) => applyFromX(e.nativeEvent.locationX),
      onPanResponderRelease: (e) => applyFromX(e.nativeEvent.locationX),
    })
  ).current;

  function applyFromX(rawX: number) {
    const clampedX = Math.max(0, Math.min(TRACK_WIDTH, rawX));
    const ratio = clampedX / TRACK_WIDTH;
    const next = Math.round(MIN_FONT + ratio * (MAX_FONT - MIN_FONT));
    if (next !== fontRef.current) {
      fontRef.current = next;
      setFontSize(next);
      // Push the new font size into the WebView without reloading — keeps
      // the reader's scroll position roughly stable.
      webviewRef.current?.injectJavaScript(`window.setFontSize(${next}); true;`);
    }
  }

  const thumbLeft = ((fontSize - MIN_FONT) / (MAX_FONT - MIN_FONT)) * TRAVEL;

  // Build HTML once per loaded document — re-rendering the WebView on every
  // font tick would yank the user back to page 1 each time.
  const html = useMemo(() => {
    if (text == null) return '';
    return buildHtml(text, DEFAULT_FONT, Colors.mainBg);
  }, [text]);

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(e.nativeEvent.data);
      if (typeof data.totalPages === 'number') setTotalPages(data.totalPages);
      if (typeof data.currentPage === 'number') setPageIndex(data.currentPage);
    } catch {}
  };

  const openExternal = () => {
    Linking.openURL(resolveImageUrl(filePath)).catch(() => {});
  };

  return (
    <Modal
      visible
      animationType="fade"
      onRequestClose={onClose}
      // iOS Modals default to portrait-only regardless of the app-level
      // orientation unlock — without this the PDF reader never rotates.
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
    >
      <View
        style={[
          styles.sheet,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          <Pressable
            style={({ pressed }) => [styles.xBtn, pressed && { opacity: 0.7 }]}
            onPress={onClose}
            hitSlop={8}
          >
            <Text style={styles.xBtnText}>×</Text>
          </Pressable>
        </View>
        {pdfInApp && pdfError ? (
          <View style={styles.fallback}>
            <Text style={styles.loadingText}>couldn't load this piece — the server may be catching its breath</Text>
            <Pressable
              style={styles.openBtn}
              onPress={() => { setPdfError(false); setPdfAttempt((a) => a + 1); }}
            >
              <Text style={styles.openBtnText}>try again</Text>
            </Pressable>
          </View>
        ) : pdfInApp ? (
          <View style={styles.readerWrap}>
            <WebView
              key={pdfAttempt}
              source={{ uri: resolveImageUrl(filePath) }}
              style={styles.webview}
              bounces={false}
              showsHorizontalScrollIndicator={false}
              automaticallyAdjustContentInsets={false}
              contentInsetAdjustmentBehavior="never"
              onError={() => setPdfError(true)}
              onHttpError={(e: any) => {
                if ((e?.nativeEvent?.statusCode ?? 0) >= 400) setPdfError(true);
              }}
            />
          </View>
        ) : !previewable ? (
          <View style={styles.fallback}>
            <Pressable style={styles.openBtn} onPress={openExternal}>
              <Text style={styles.openBtnText}>open file</Text>
            </Pressable>
          </View>
        ) : textError ? (
          <View style={styles.fallback}>
            <Text style={styles.loadingText}>couldn't load this piece — the server may be catching its breath</Text>
            <Pressable style={styles.openBtn} onPress={retryText}>
              <Text style={styles.openBtnText}>try again</Text>
            </Pressable>
          </View>
        ) : text == null ? (
          <View style={styles.fallback}>
            <Text style={styles.loadingText}>loading…</Text>
          </View>
        ) : (
          <View style={styles.readerWrap}>
            <WebView
              ref={webviewRef}
              originWhitelist={['*']}
              source={{ html }}
              onMessage={onMessage}
              // scrollEnabled left at default (true) — was false before, which
              // on iOS blocks touch events from reaching the inner #reader
              // overflow scroller, killing the page swipe entirely.
              bounces={false}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
              style={styles.webview}
              androidLayerType="hardware"
              automaticallyAdjustContentInsets={false}
              contentInsetAdjustmentBehavior="never"
            />
          </View>
        )}
        {previewable && (
          <View style={styles.footer}>
            <View style={styles.sliderRow}>
              <Text style={styles.sliderLabelSmall}>A</Text>
              <View
                style={styles.track}
                {...sliderResponder.panHandlers}
              >
                <View style={styles.trackLine} />
                <View style={[styles.thumb, { left: thumbLeft }]} pointerEvents="none" />
              </View>
              <Text style={styles.sliderLabelLarge}>A</Text>
            </View>
            <View style={{ flex: 1 }} />
            {totalPages > 1 && (
              <Text style={styles.pageIndicator}>{pageIndex + 1} / {totalPages}</Text>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: Colors.mainBg,
    paddingHorizontal: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  title: {
    flex: 1,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
  },
  xBtn: {
    width: 28,
    height: 28,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  xBtnText: {
    fontFamily: Fonts.serif,
    fontSize: 18,
    lineHeight: 20,
    color: Colors.black,
  },
  readerWrap: {
    flex: 1,
    marginTop: 10,
  },
  webview: {
    flex: 1,
    backgroundColor: Colors.mainBg,
  },
  pageIndicator: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  fallback: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.textTertiary,
  },
  openBtn: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.greenBright,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  openBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 10,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sliderLabelSmall: {
    fontFamily: Fonts.serif,
    fontSize: 11,
    color: Colors.black,
  },
  sliderLabelLarge: {
    fontFamily: Fonts.serif,
    fontSize: 20,
    color: Colors.black,
  },
  track: {
    width: TRACK_WIDTH,
    height: THUMB_SIZE + 12,
    justifyContent: 'center',
  },
  trackLine: {
    height: 2,
    backgroundColor: '#000',
    marginHorizontal: THUMB_SIZE / 2,
  },
  thumb: {
    position: 'absolute',
    top: 6,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: Colors.accentGolden,
    borderWidth: 1,
    borderColor: '#000',
  },
});
