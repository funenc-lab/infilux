import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const proxyConfigTestDoubles = vi.hoisted(() => {
  const defaultSetProxy = vi.fn();
  const updaterSetProxy = vi.fn();
  const testSetProxy = vi.fn();
  const testFetch = vi.fn();
  const clearCache = vi.fn();
  const clearStorageData = vi.fn();
  const fromPartition = vi.fn();

  const defaultSession = {
    setProxy: defaultSetProxy,
  };

  const updaterSession = {
    setProxy: updaterSetProxy,
  };

  const testSession = {
    setProxy: testSetProxy,
    fetch: testFetch,
    clearCache,
    clearStorageData,
  };

  function reset() {
    defaultSetProxy.mockReset();
    updaterSetProxy.mockReset();
    testSetProxy.mockReset();
    testFetch.mockReset();
    clearCache.mockReset();
    clearStorageData.mockReset();
    fromPartition.mockReset();

    defaultSetProxy.mockResolvedValue(undefined);
    updaterSetProxy.mockResolvedValue(undefined);
    testSetProxy.mockResolvedValue(undefined);
    clearCache.mockResolvedValue(undefined);
    clearStorageData.mockResolvedValue(undefined);
    fromPartition.mockReturnValue(testSession);
  }

  return {
    session: {
      defaultSession,
      fromPartition,
    },
    updaterSession,
    testSession,
    reset,
  };
});

vi.mock('electron', () => ({
  session: proxyConfigTestDoubles.session,
}));

describe('ProxyConfig', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    proxyConfigTestDoubles.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('applies proxy settings, updater routing, and environment variables', async () => {
    const { applyProxy, getProxyEnvVars, registerUpdaterSession } = await import('../ProxyConfig');

    registerUpdaterSession(proxyConfigTestDoubles.updaterSession as never);

    await applyProxy({
      enabled: true,
      server: '127.0.0.1:7897',
      bypassList: ' localhost , *.example.com, 127.0.0.1 ',
      useProxyForUpdates: true,
    });

    expect(proxyConfigTestDoubles.session.defaultSession.setProxy).toHaveBeenCalledWith({
      proxyRules: 'http://127.0.0.1:7897',
      proxyBypassRules: 'localhost,.example.com,127.0.0.1',
    });
    expect(proxyConfigTestDoubles.updaterSession.setProxy).toHaveBeenCalledWith({
      proxyRules: 'http://127.0.0.1:7897',
      proxyBypassRules: 'localhost,.example.com,127.0.0.1',
    });
    expect(getProxyEnvVars()).toEqual({
      HTTP_PROXY: 'http://127.0.0.1:7897',
      HTTPS_PROXY: 'http://127.0.0.1:7897',
      http_proxy: 'http://127.0.0.1:7897',
      https_proxy: 'http://127.0.0.1:7897',
      ALL_PROXY: 'http://127.0.0.1:7897',
      NO_PROXY: 'localhost,.example.com,127.0.0.1',
      no_proxy: 'localhost,.example.com,127.0.0.1',
    });
  });

  it('disables proxy routing and falls back to system updater mode', async () => {
    const { applyProxy, getProxyEnvVars, registerUpdaterSession } = await import('../ProxyConfig');

    registerUpdaterSession(proxyConfigTestDoubles.updaterSession as never);

    await applyProxy({
      enabled: false,
      server: '',
      bypassList: '',
      useProxyForUpdates: false,
    });

    expect(proxyConfigTestDoubles.session.defaultSession.setProxy).toHaveBeenCalledWith({
      mode: 'direct',
    });
    expect(proxyConfigTestDoubles.updaterSession.setProxy).toHaveBeenCalledWith({
      mode: 'system',
    });
    expect(getProxyEnvVars()).toEqual({});
  });

  it('tests proxy endpoints, returns latency on success, and cleans up test session state', async () => {
    const nowValues = [100, 145];
    vi.spyOn(Date, 'now').mockImplementation(() => nowValues.shift() ?? 145);

    proxyConfigTestDoubles.testSession.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('first failed'))
      .mockResolvedValueOnce({ ok: false, status: 204 });
    proxyConfigTestDoubles.session.fromPartition.mockReturnValue(
      proxyConfigTestDoubles.testSession
    );

    const { testProxy } = await import('../ProxyConfig');

    await expect(testProxy('socks5://127.0.0.1:1080')).resolves.toEqual({
      success: true,
      latency: 0,
    });

    expect(proxyConfigTestDoubles.session.fromPartition).toHaveBeenCalledWith('proxy-test');
    expect(proxyConfigTestDoubles.testSession.setProxy).toHaveBeenCalledWith({
      proxyRules: 'socks5://127.0.0.1:1080',
      proxyBypassRules: '',
    });
    expect(proxyConfigTestDoubles.testSession.fetch).toHaveBeenCalledTimes(2);
    expect(proxyConfigTestDoubles.testSession.clearCache).toHaveBeenCalledTimes(1);
    expect(proxyConfigTestDoubles.testSession.clearStorageData).toHaveBeenCalledTimes(1);
  });

  it('returns a failure result when all probe URLs or proxy setup fail', async () => {
    proxyConfigTestDoubles.testSession.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    proxyConfigTestDoubles.session.fromPartition.mockReturnValue(
      proxyConfigTestDoubles.testSession
    );

    const { testProxy } = await import('../ProxyConfig');

    await expect(testProxy('http://127.0.0.1:7897')).resolves.toEqual({
      success: false,
      error: 'All test endpoints failed',
    });

    proxyConfigTestDoubles.testSession.setProxy.mockRejectedValueOnce(new Error('bad config'));
    await expect(testProxy('127.0.0.1:7897')).resolves.toEqual({
      success: false,
      error: 'bad config',
    });
  });
});
