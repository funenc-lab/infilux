import { useSyncExternalStore } from 'react';

const IDLE_THRESHOLD_MS = 90 * 1000; // Treat 90 seconds without input as idle.
const hasDomEnvironment = typeof window !== 'undefined' && typeof document !== 'undefined';

let isWindowFocused = hasDomEnvironment ? !document.hidden : true;
let isIdle = false;
let idleTimeoutId: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

let cachedSnapshot = { isWindowFocused, isIdle };

function updateSnapshot() {
  cachedSnapshot = { isWindowFocused, isIdle };
}

function notifyListeners() {
  updateSnapshot();
  for (const listener of listeners) {
    listener();
  }
}

function resetIdleTimer() {
  if (idleTimeoutId) {
    clearTimeout(idleTimeoutId);
  }

  if (isIdle) {
    isIdle = false;
    notifyListeners();
  }

  // Start idle detection only while the window is focused.
  if (isWindowFocused && listeners.size > 0) {
    idleTimeoutId = setTimeout(() => {
      isIdle = true;
      notifyListeners();
    }, IDLE_THRESHOLD_MS);
  }
}

function handleUserActivity() {
  resetIdleTimer();
}

function handleVisibilityChange() {
  const wasFocused = isWindowFocused;
  isWindowFocused = !document.hidden;

  if (isWindowFocused && !wasFocused) {
    // Reset idle state when focus returns.
    resetIdleTimer();
  } else if (!isWindowFocused && wasFocused) {
    // Mark the window idle immediately when focus leaves.
    if (idleTimeoutId) {
      clearTimeout(idleTimeoutId);
      idleTimeoutId = null;
    }
    isIdle = true;
    notifyListeners();
  }
}

function handleWindowFocus() {
  if (!isWindowFocused) {
    isWindowFocused = true;
    resetIdleTimer();
  }
}

function handleWindowBlur() {
  if (isWindowFocused) {
    isWindowFocused = false;
    if (idleTimeoutId) {
      clearTimeout(idleTimeoutId);
      idleTimeoutId = null;
    }
    isIdle = true;
    notifyListeners();
  }
}

if (hasDomEnvironment) {
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('focus', handleWindowFocus);
  window.addEventListener('blur', handleWindowBlur);

  // Track user activity signals that should reset idle state.
  const userActivityEvents = ['mousemove', 'keydown', 'mousedown', 'wheel', 'touchstart'];
  for (const event of userActivityEvents) {
    window.addEventListener(event, handleUserActivity, { passive: true });
  }
}

function subscribe(callback: () => void) {
  const wasEmpty = listeners.size === 0;
  listeners.add(callback);
  if (wasEmpty) {
    resetIdleTimer();
  }

  return () => {
    listeners.delete(callback);
    if (listeners.size === 0 && idleTimeoutId) {
      clearTimeout(idleTimeoutId);
      idleTimeoutId = null;
    }
  };
}

function getSnapshot() {
  return cachedSnapshot;
}

const serverSnapshot = { isWindowFocused: true, isIdle: false };
function getServerSnapshot() {
  return serverSnapshot;
}

export function useWindowFocus() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useShouldPoll() {
  const { isIdle } = useWindowFocus();
  return !isIdle;
}
