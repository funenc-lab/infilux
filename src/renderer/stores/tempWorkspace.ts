import type { TempWorkspaceItem } from '@shared/types';
import { create } from 'zustand';
import { sanitizeTempWorkspaceItems } from '@/lib/worktreeData';

const TEMP_WORKSPACES_KEY = 'enso-temp-workspaces';

function loadFromStorage(): TempWorkspaceItem[] {
  try {
    const saved = localStorage.getItem(TEMP_WORKSPACES_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved) as TempWorkspaceItem[];
    return sanitizeTempWorkspaceItems(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
}

function saveToStorage(items: TempWorkspaceItem[]): void {
  localStorage.setItem(TEMP_WORKSPACES_KEY, JSON.stringify(sanitizeTempWorkspaceItems(items)));
}

interface TempWorkspaceState {
  items: TempWorkspaceItem[];
  renameTargetId: string | null;
  deleteTargetId: string | null;
  setItems: (items: TempWorkspaceItem[]) => void;
  addItem: (item: TempWorkspaceItem) => void;
  removeItem: (id: string) => void;
  renameItem: (id: string, title: string) => void;
  openRename: (id: string | null) => void;
  openDelete: (id: string | null) => void;
  rehydrate: () => Promise<void>;
}

let rehydratePromise: Promise<void> | null = null;

function getErrorCode(err: unknown): string | null {
  if (err && typeof err === 'object' && 'code' in err) {
    return String((err as { code?: string }).code || '');
  }
  return null;
}

async function fallbackRehydrateItems(items: TempWorkspaceItem[]): Promise<TempWorkspaceItem[]> {
  const safeItems = sanitizeTempWorkspaceItems(items);
  const results = await Promise.allSettled(
    safeItems.map((item) => window.electronAPI.file.list(item.path))
  );
  return safeItems.filter((_item, index) => {
    const result = results[index];
    if (result.status === 'fulfilled') {
      return true;
    }
    const code = getErrorCode(result.reason);
    return code !== 'ENOENT' && code !== 'ENOTDIR';
  });
}

async function rehydrateItems(items: TempWorkspaceItem[]): Promise<TempWorkspaceItem[]> {
  const safeItems = sanitizeTempWorkspaceItems(items);
  const tempWorkspaceApi = window.electronAPI.tempWorkspace;
  if (tempWorkspaceApi?.rehydrate) {
    return sanitizeTempWorkspaceItems(await tempWorkspaceApi.rehydrate(safeItems));
  }
  return fallbackRehydrateItems(safeItems);
}

export const useTempWorkspaceStore = create<TempWorkspaceState>((set, get) => ({
  items: loadFromStorage(),
  renameTargetId: null,
  deleteTargetId: null,
  setItems: (items) => {
    const safeItems = sanitizeTempWorkspaceItems(items);
    saveToStorage(safeItems);
    set({ items: safeItems });
  },
  addItem: (item) => {
    const next = sanitizeTempWorkspaceItems([...get().items, item]);
    saveToStorage(next);
    set({ items: next });
  },
  removeItem: (id) => {
    const next = sanitizeTempWorkspaceItems(get().items.filter((item) => item.id !== id));
    saveToStorage(next);
    set({ items: next });
  },
  renameItem: (id, title) => {
    const next = sanitizeTempWorkspaceItems(
      get().items.map((item) => (item.id === id ? { ...item, title } : item))
    );
    saveToStorage(next);
    set({ items: next });
  },
  openRename: (id) => set({ renameTargetId: id }),
  openDelete: (id) => set({ deleteTargetId: id }),
  rehydrate: async () => {
    if (rehydratePromise) {
      try {
        await rehydratePromise;
      } catch (err) {
        console.error('Temp Session rehydrate failed', err);
      }
      return;
    }
    rehydratePromise = (async () => {
      const items = loadFromStorage();
      const hydratedItems = await rehydrateItems(items);
      saveToStorage(hydratedItems);
      set({ items: hydratedItems });
    })();
    try {
      await rehydratePromise;
    } catch (err) {
      console.error('Temp Session rehydrate failed', err);
    } finally {
      rehydratePromise = null;
    }
  },
}));
