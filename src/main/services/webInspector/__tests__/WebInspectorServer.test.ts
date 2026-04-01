import { IPC_CHANNELS } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type RequestHandler = (req: FakeRequest, res: FakeResponse) => void;

const webInspectorDoubles = vi.hoisted(() => {
  class FakeServer {
    public listening = false;

    public on = vi.fn((event: string, handler: (error: NodeJS.ErrnoException) => void) => {
      if (event === 'error') {
        state.errorHandler = handler;
      }
      return this;
    });

    public listen = vi.fn((port: number, host: string, callback: () => void) => {
      state.listenArgs = { port, host };
      this.listening = true;
      state.listenCallback = callback;
      if (state.autoInvokeListenCallback) {
        callback();
      }
      return this;
    });

    public close = vi.fn((callback?: () => void) => {
      this.listening = false;
      callback?.();
      return this;
    });
  }

  const createServer = vi.fn((handler: RequestHandler) => {
    if (state.createServerError) {
      throw state.createServerError;
    }

    const server = new FakeServer();
    state.requestHandler = handler;
    state.server = server;
    return server;
  });

  const state = {
    autoInvokeListenCallback: true,
    createServerError: null as Error | null,
    requestHandler: null as RequestHandler | null,
    server: null as FakeServer | null,
    errorHandler: null as ((error: NodeJS.ErrnoException) => void) | null,
    listenArgs: null as { port: number; host: string } | null,
    listenCallback: null as (() => void) | null,
  };

  function emitError(error: NodeJS.ErrnoException) {
    state.errorHandler?.(error);
  }

  function reset() {
    createServer.mockClear();
    state.autoInvokeListenCallback = true;
    state.createServerError = null;
    state.requestHandler = null;
    state.server = null;
    state.errorHandler = null;
    state.listenArgs = null;
    state.listenCallback = null;
  }

  return {
    createServer,
    emitError,
    reset,
    state,
  };
});

vi.mock('node:http', () => ({
  default: {
    createServer: webInspectorDoubles.createServer,
  },
}));

class FakeRequest {
  public destroy = vi.fn();
  private readonly handlers = new Map<string, (chunk?: Buffer) => void>();

  constructor(
    public readonly method: string,
    public readonly url: string
  ) {}

  on(event: 'data' | 'end', handler: (chunk?: Buffer) => void) {
    this.handlers.set(event, handler);
    return this;
  }

  emitData(body: string | Buffer) {
    const chunk = Buffer.isBuffer(body) ? body : Buffer.from(body);
    this.handlers.get('data')?.(chunk);
  }

  emitEnd() {
    this.handlers.get('end')?.();
  }
}

class FakeResponse {
  public readonly headers = new Map<string, string>();
  public readonly body: string[] = [];
  public statusCode: number | null = null;

  public setHeader = vi.fn((name: string, value: string) => {
    this.headers.set(name, value);
  });

  public writeHead = vi.fn((statusCode: number) => {
    this.statusCode = statusCode;
  });

  public end = vi.fn((body?: string) => {
    if (body !== undefined) {
      this.body.push(body);
    }
  });
}

function createMainWindow(isDestroyed = false) {
  const send = vi.fn();
  return {
    send,
    window: {
      isDestroyed: vi.fn(() => isDestroyed),
      webContents: { send },
    },
  };
}

function getRequestHandler() {
  const handler = webInspectorDoubles.state.requestHandler;
  expect(handler).toBeTypeOf('function');
  return handler as RequestHandler;
}

describe('WebInspectorServer', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    webInspectorDoubles.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts once, reports status changes, forwards inspect payloads, and stops cleanly', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { WebInspectorServer, webInspectorServer } = await import('../WebInspectorServer');
    const server = new WebInspectorServer();
    const mainWindow = createMainWindow();
    const primaryCallback = vi.fn();
    const secondaryCallback = vi.fn();

    expect(webInspectorServer).toBeInstanceOf(WebInspectorServer);
    server.setMainWindow(mainWindow.window as never);

    server.onStatusChange(primaryCallback);
    const unsubscribeSecondary = server.onStatusChange(secondaryCallback);

    await expect(server.start()).resolves.toEqual({ success: true });
    await expect(server.start()).resolves.toEqual({ success: true });

    expect(webInspectorDoubles.createServer).toHaveBeenCalledTimes(1);
    expect(webInspectorDoubles.state.listenArgs).toEqual({
      port: 18765,
      host: '127.0.0.1',
    });
    expect(server.isRunning()).toBe(true);
    expect(server.getStatus()).toEqual({ running: true, port: 18765 });
    expect(primaryCallback).toHaveBeenCalledTimes(1);
    expect(primaryCallback).toHaveBeenCalledWith({ running: true, port: 18765 });
    expect(secondaryCallback).toHaveBeenCalledTimes(1);
    expect(mainWindow.send).toHaveBeenCalledWith(IPC_CHANNELS.WEB_INSPECTOR_STATUS_CHANGED, {
      running: true,
      port: 18765,
    });
    expect(logSpy).toHaveBeenCalledWith('[WebInspector] Server started on port 18765');

    const handler = getRequestHandler();
    const request = new FakeRequest('POST', '/inspect');
    const response = new FakeResponse();
    const payload = {
      element: 'button',
      path: 'body > button',
      attributes: { id: 'save' },
      styles: { display: 'block' },
      position: { top: '1px', left: '2px', width: '3px', height: '4px' },
      innerText: 'Save',
      url: 'http://localhost:3000',
      timestamp: 123,
    };

    handler(request, response);
    request.emitData(JSON.stringify(payload));
    request.emitEnd();

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual([JSON.stringify({ success: true })]);
    expect(mainWindow.send).toHaveBeenCalledWith(IPC_CHANNELS.WEB_INSPECTOR_DATA, payload);

    unsubscribeSecondary();
    await expect(server.stop()).resolves.toBeUndefined();
    await expect(server.stop()).resolves.toBeUndefined();

    expect(server.isRunning()).toBe(false);
    expect(server.getStatus()).toEqual({ running: false, port: 18765 });
    expect(primaryCallback).toHaveBeenNthCalledWith(2, { running: false, port: 18765 });
    expect(secondaryCallback).toHaveBeenCalledTimes(1);
    expect(mainWindow.send).toHaveBeenCalledWith(IPC_CHANNELS.WEB_INSPECTOR_STATUS_CHANGED, {
      running: false,
      port: 18765,
    });
    expect(logSpy).toHaveBeenCalledWith('[WebInspector] Server stopped');
  });

  it('handles CORS, preflight, invalid routes, invalid JSON, and oversized requests', async () => {
    const { WebInspectorServer } = await import('../WebInspectorServer');
    const server = new WebInspectorServer();
    const destroyedWindow = createMainWindow(true);

    server.setMainWindow(destroyedWindow.window as never);
    await expect(server.start()).resolves.toEqual({ success: true });

    const handler = getRequestHandler();

    const optionsRequest = new FakeRequest('OPTIONS', '/inspect');
    const optionsResponse = new FakeResponse();
    handler(optionsRequest, optionsResponse);
    expect(optionsResponse.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
    expect(optionsResponse.setHeader).toHaveBeenCalledWith(
      'Access-Control-Allow-Methods',
      'POST, OPTIONS'
    );
    expect(optionsResponse.setHeader).toHaveBeenCalledWith(
      'Access-Control-Allow-Headers',
      'Content-Type'
    );
    expect(optionsResponse.statusCode).toBe(204);
    expect(destroyedWindow.send).not.toHaveBeenCalled();

    const notFoundRequest = new FakeRequest('GET', '/unknown');
    const notFoundResponse = new FakeResponse();
    handler(notFoundRequest, notFoundResponse);
    expect(notFoundResponse.statusCode).toBe(404);
    expect(notFoundResponse.body).toEqual([JSON.stringify({ error: 'Not found' })]);

    const invalidJsonRequest = new FakeRequest('POST', '/inspect');
    const invalidJsonResponse = new FakeResponse();
    handler(invalidJsonRequest, invalidJsonResponse);
    invalidJsonRequest.emitData('{invalid');
    invalidJsonRequest.emitEnd();
    expect(invalidJsonResponse.statusCode).toBe(400);
    expect(invalidJsonResponse.body).toEqual([JSON.stringify({ error: 'Invalid JSON' })]);

    const oversizedRequest = new FakeRequest('POST', '/inspect');
    const oversizedResponse = new FakeResponse();
    handler(oversizedRequest, oversizedResponse);
    oversizedRequest.emitData(Buffer.alloc(1024 * 1024 + 1, 'a'));
    expect(oversizedRequest.destroy).toHaveBeenCalledTimes(1);
    expect(oversizedResponse.statusCode).toBe(413);
    expect(oversizedResponse.body).toEqual([JSON.stringify({ error: 'Request body too large' })]);

    await expect(server.stop()).resolves.toBeUndefined();
    expect(destroyedWindow.send).not.toHaveBeenCalled();
  });

  it('reports port conflicts and startup exceptions', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { WebInspectorServer } = await import('../WebInspectorServer');
    const server = new WebInspectorServer();
    const statusCallback = vi.fn();

    server.onStatusChange(statusCallback);
    webInspectorDoubles.state.autoInvokeListenCallback = false;

    const startPromise = server.start();
    webInspectorDoubles.emitError(
      Object.assign(new Error('address in use'), {
        code: 'EADDRINUSE',
      }) as NodeJS.ErrnoException
    );

    await expect(startPromise).resolves.toEqual({
      success: false,
      error: 'Port 18765 is already in use',
    });
    expect(server.isRunning()).toBe(false);
    expect(server.getStatus()).toEqual({ running: false, port: 18765 });
    expect(statusCallback).toHaveBeenCalledWith({ running: false, port: 18765 });
    expect(errorSpy).toHaveBeenCalledWith(
      '[WebInspector] Server error:',
      expect.objectContaining({ code: 'EADDRINUSE' })
    );

    webInspectorDoubles.reset();
    webInspectorDoubles.state.createServerError = new Error('boom');

    const failingServer = new WebInspectorServer();
    await expect(failingServer.start()).resolves.toEqual({
      success: false,
      error: 'Error: boom',
    });
    expect(errorSpy).toHaveBeenCalledWith(
      '[WebInspector] Failed to start server:',
      expect.any(Error)
    );
  });
});
