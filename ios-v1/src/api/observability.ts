// Best-effort client telemetry transport. Two independent trails share one
// token + batching plumbing:
//   - usage (#5): logins + screen-focus navigation → POST /usage
//   - device (#6): crashes / memory warnings / perf → POST /telemetry
// Everything here is fire-and-forget: a failed flush drops its batch rather
// than retrying, so telemetry can never block the UI or grow unbounded.
import { Platform, DeviceEventEmitter } from 'react-native';
import Constants from 'expo-constants';
import { request } from './client';

let token: string | null = null;

/** Called from AuthContext whenever the auth token changes (login/logout/refresh). */
export function setObservabilityToken(t: string | null) {
  token = t;
  if (!t) {
    // Logged out — drop anything queued so it isn't sent under the next login.
    usageQueue = [];
    deviceQueue = [];
    lastScreen = null;
    if (usageTimer) {
      clearTimeout(usageTimer);
      usageTimer = null;
    }
  }
}

// --- Usage trail (#5) ---------------------------------------------------------

type UsageItem = { kind: 'login' | 'screen'; screen?: string; at: string };

let usageQueue: UsageItem[] = [];
let usageTimer: ReturnType<typeof setTimeout> | null = null;
let lastScreen: string | null = null;

const USAGE_FLUSH_MS = 15000;
const USAGE_MAX_BATCH = 25;

function scheduleUsageFlush() {
  if (usageTimer) return;
  usageTimer = setTimeout(() => {
    usageTimer = null;
    void flushUsage();
  }, USAGE_FLUSH_MS);
}

export async function flushUsage() {
  if (usageTimer) {
    clearTimeout(usageTimer);
    usageTimer = null;
  }
  if (!token || usageQueue.length === 0) return;
  const batch = usageQueue;
  usageQueue = [];
  try {
    await request('/usage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ events: batch }),
    });
  } catch {
    // best-effort: drop the batch on failure
  }
}

/** Record a screen focus. Consecutive repeats of the same route are ignored. */
export function recordScreen(screen: string) {
  if (!screen || screen === lastScreen) return;
  lastScreen = screen;
  usageQueue.push({ kind: 'screen', screen, at: new Date().toISOString() });
  if (usageQueue.length >= USAGE_MAX_BATCH) void flushUsage();
  else scheduleUsageFlush();
}

/** Record a successful login. Flushed immediately (with any queued screens). */
export function recordLogin() {
  usageQueue.push({ kind: 'login', at: new Date().toISOString() });
  void flushUsage();
}

// --- Device telemetry (#6) ----------------------------------------------------

type DeviceItem = {
  kind: 'crash' | 'memory_warning' | 'perf';
  platform?: string;
  app_version?: string;
  os_version?: string;
  device_model?: string;
  detail?: string;
  at: string;
};

let deviceQueue: DeviceItem[] = [];

export async function flushTelemetry() {
  if (!token || deviceQueue.length === 0) return;
  const batch = deviceQueue;
  deviceQueue = [];
  try {
    await request('/telemetry', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ events: batch }),
    });
  } catch {
    // best-effort: drop the batch on failure
  }
}

/** Record a device event (crash/memory/perf). Flushed on the next tick so a
 *  burst of warnings coalesces into one request. */
export function recordDeviceEvent(e: Omit<DeviceItem, 'at'>) {
  deviceQueue.push({ ...e, at: new Date().toISOString() });
  // Memory warnings can arrive in bursts; a short defer batches them.
  setTimeout(() => void flushTelemetry(), 0);
}

function deviceMeta() {
  return {
    platform: Platform.OS,
    app_version: (Constants.expoConfig?.version as string) || undefined,
    os_version: String(Platform.Version),
    // No expo-device in the build; deviceName is the closest cheap identifier.
    device_model: (Constants.deviceName as string) || undefined,
  };
}

let telemetryInited = false;

/** Wire the device-telemetry sources once at startup (idempotent). Captures
 *  OS low-memory warnings and fatal JS errors. Crash capture is best-effort:
 *  the flush is async, so a hard crash may lose the in-flight request — Sentry
 *  remains the source of truth for crashes; this table is a lightweight in-app
 *  view for the contributor "infra stats" panel. */
export function initDeviceTelemetry() {
  if (telemetryInited) return;
  telemetryInited = true;

  // iOS/Android low-memory warnings arrive on this global event.
  try {
    DeviceEventEmitter.addListener('memoryWarning', () => {
      recordDeviceEvent({ kind: 'memory_warning', ...deviceMeta() });
    });
  } catch {
    // event may not exist on every platform build — non-fatal
  }

  // Record fatal JS errors, then defer to the previous handler (Sentry / RN
  // redbox) so nothing downstream is lost.
  const g: any = global as any;
  if (g.ErrorUtils?.getGlobalHandler && g.ErrorUtils?.setGlobalHandler) {
    const prev = g.ErrorUtils.getGlobalHandler();
    g.ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
      try {
        recordDeviceEvent({
          kind: 'crash',
          detail: `${error?.name || 'Error'}: ${error?.message || String(error)}${isFatal ? ' (fatal)' : ''}`,
          ...deviceMeta(),
        });
      } catch {
        // never let telemetry throw inside the crash handler
      }
      if (typeof prev === 'function') prev(error, isFatal);
    });
  }
}
