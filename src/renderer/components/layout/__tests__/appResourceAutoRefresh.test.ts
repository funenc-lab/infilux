import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APP_RESOURCE_AUTO_REFRESH_INTERVAL_MS,
  createAppResourceAutoRefreshController,
} from '../appResourceAutoRefresh';

describe('appResourceAutoRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts only one polling interval while auto refresh stays enabled', () => {
    const onRefresh = vi.fn();
    const setIntervalFn = vi.fn(globalThis.setInterval);
    const clearIntervalFn = vi.fn(globalThis.clearInterval);
    const controller = createAppResourceAutoRefreshController({
      setIntervalFn,
      clearIntervalFn,
    });

    controller.sync({ enabled: true, onRefresh });
    controller.sync({ enabled: true, onRefresh });

    expect(setIntervalFn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(APP_RESOURCE_AUTO_REFRESH_INTERVAL_MS * 2);

    expect(onRefresh).toHaveBeenCalledTimes(2);
    expect(clearIntervalFn).not.toHaveBeenCalled();
  });

  it('stops polling when auto refresh is disabled or disposed', () => {
    const onRefresh = vi.fn();
    const setIntervalFn = vi.fn(globalThis.setInterval);
    const clearIntervalFn = vi.fn(globalThis.clearInterval);
    const controller = createAppResourceAutoRefreshController({
      setIntervalFn,
      clearIntervalFn,
    });

    controller.sync({ enabled: true, onRefresh });
    vi.advanceTimersByTime(APP_RESOURCE_AUTO_REFRESH_INTERVAL_MS);
    expect(onRefresh).toHaveBeenCalledTimes(1);

    controller.sync({ enabled: false, onRefresh });
    vi.advanceTimersByTime(APP_RESOURCE_AUTO_REFRESH_INTERVAL_MS * 2);
    expect(onRefresh).toHaveBeenCalledTimes(1);

    controller.dispose();
    expect(clearIntervalFn).toHaveBeenCalledTimes(1);
  });

  it('uses the latest refresh callback without creating a new timer', () => {
    const firstRefresh = vi.fn();
    const secondRefresh = vi.fn();
    const setIntervalFn = vi.fn(globalThis.setInterval);
    const controller = createAppResourceAutoRefreshController({
      setIntervalFn,
    });

    controller.sync({ enabled: true, onRefresh: firstRefresh });
    controller.sync({ enabled: true, onRefresh: secondRefresh });

    vi.advanceTimersByTime(APP_RESOURCE_AUTO_REFRESH_INTERVAL_MS);

    expect(setIntervalFn).toHaveBeenCalledTimes(1);
    expect(firstRefresh).not.toHaveBeenCalled();
    expect(secondRefresh).toHaveBeenCalledTimes(1);
  });
});
