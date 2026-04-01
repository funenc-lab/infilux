import { useEffect, useRef } from 'react';

export function useDeferredReady(isReady: boolean, onReady?: () => void) {
  const hasNotifiedReadyRef = useRef(false);

  useEffect(() => {
    if (!isReady || hasNotifiedReadyRef.current) {
      return;
    }

    hasNotifiedReadyRef.current = true;
    onReady?.();
  }, [isReady, onReady]);

  useEffect(() => {
    if (!isReady) {
      hasNotifiedReadyRef.current = false;
    }
  }, [isReady]);
}
