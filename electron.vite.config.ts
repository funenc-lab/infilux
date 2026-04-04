import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import type { Rollup } from 'vite';

const COMMON_JS_SHIM_BLOCK =
  '// -- CommonJS Shims --\n' +
  "import __cjs_mod__ from 'node:module';\n" +
  'const __filename = import.meta.filename;\n' +
  'const __dirname = import.meta.dirname;\n' +
  'const require = __cjs_mod__.createRequire(import.meta.url);\n';

function normalizeCommonJsShims() {
  return {
    name: 'normalize-commonjs-shims',
    renderChunk(code: string, chunk: Rollup.RenderedChunk) {
      if (chunk.fileName !== 'index.js') {
        return null;
      }

      const injectedBlock = `\n${COMMON_JS_SHIM_BLOCK}`;
      const blockIndex = code.indexOf(injectedBlock);
      if (blockIndex <= 0) {
        return null;
      }

      return {
        code:
          COMMON_JS_SHIM_BLOCK +
          code.slice(0, blockIndex) +
          code.slice(blockIndex + injectedBlock.length),
        map: null,
      };
    },
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': path.resolve(__dirname, 'src/shared'),
      },
    },
    build: {
      rollupOptions: {
        external: ['node-pty', '@parcel/watcher'],
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
          // Keep the Electron main process in a single bundle to avoid circular cross-chunk imports.
          inlineDynamicImports: true,
          plugins: [normalizeCommonJsShims()],
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': path.resolve(__dirname, 'src/shared'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
      },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src/renderer'),
        '@shared': path.resolve(__dirname, 'src/shared'),
      },
    },
    server: {
      host: '127.0.0.1',
      strictPort: true,
    },
    build: {
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'src/renderer/index.html'),
        },
      },
    },
  },
});
