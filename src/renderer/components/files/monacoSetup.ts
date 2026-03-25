import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
// Import ini language for .env file syntax highlighting
import 'monaco-editor/esm/vs/basic-languages/ini/ini.contribution';
import { computeJavaFoldingRanges } from './javaFoldingUtils';

// Configure Monaco workers for Electron environment
self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

// Tell @monaco-editor/react to use our pre-configured monaco instance
loader.config({ monaco });

const preloadLanguages = [
  'typescript',
  'javascript',
  'json',
  'markdown',
  'css',
  'scss',
  'html',
  'xml',
  'yaml',
  'python',
  'go',
  'rust',
  'swift',
  'java',
  'kotlin',
  'shell',
  'sql',
  'graphql',
  'ini', // For .env files
];

// Register .env file extensions to use ini syntax highlighting
monaco.languages.register({
  id: 'ini',
  extensions: ['.env', '.env.local', '.env.development', '.env.production', '.env.test'],
  filenames: ['.env'],
});

// Languages to highlight with Shiki (not natively supported by Monaco)
const SHIKI_LANGUAGES = ['vue', 'svelte', 'astro'];
const SHIKI_THEMES = new Set(['vitesse-dark', 'vitesse-light']);
let monacoSetupPromise: Promise<void> | null = null;
let languagesPreloaded = false;
let shikiBridgeInstalled = false;

function preloadMonacoLanguages(): void {
  if (languagesPreloaded) {
    return;
  }

  for (const lang of preloadLanguages) {
    try {
      const tempModel = monaco.editor.createModel('', lang);
      tempModel.dispose();
    } catch {
      // Language may not be supported by Monaco, skip silently
    }
  }

  languagesPreloaded = true;
}

async function installShikiBridge(): Promise<void> {
  if (shikiBridgeInstalled) {
    return;
  }

  const [
    { shikiToMonaco },
    { createHighlighterCore },
    { createJavaScriptRegexEngine },
    { default: langAstro },
    { default: langSvelte },
    { default: langVue },
    { default: themeVitesseDark },
    { default: themeVitesseLight },
  ] = await Promise.all([
    import('@shikijs/monaco'),
    import('shiki/core'),
    import('shiki/engine/javascript'),
    import('shiki/langs/astro.mjs'),
    import('shiki/langs/svelte.mjs'),
    import('shiki/langs/vue.mjs'),
    import('shiki/themes/vitesse-dark.mjs'),
    import('shiki/themes/vitesse-light.mjs'),
  ]);

  const shikiHighlighter = await createHighlighterCore({
    themes: [themeVitesseDark, themeVitesseLight],
    langs: [langVue, langSvelte, langAstro],
    engine: createJavaScriptRegexEngine(),
  });

  for (const lang of SHIKI_LANGUAGES) {
    monaco.languages.register({ id: lang, extensions: [`.${lang}`] });
  }

  const originalSetTheme = monaco.editor.setTheme.bind(monaco.editor);
  shikiToMonaco(shikiHighlighter, monaco);
  const shikiSetTheme = monaco.editor.setTheme.bind(monaco.editor);

  monaco.editor.setTheme = (themeName: string) => {
    if (SHIKI_THEMES.has(themeName)) {
      shikiSetTheme(themeName);
    } else {
      originalSetTheme(themeName);
    }
  };

  shikiBridgeInstalled = true;
}

export async function ensureMonacoSetup(): Promise<void> {
  if (monacoSetupPromise) {
    return monacoSetupPromise;
  }

  monacoSetupPromise = (async () => {
    await loader.init();
    preloadMonacoLanguages();
    await installShikiBridge();
  })().catch((error) => {
    monacoSetupPromise = null;
    throw error;
  });

  return monacoSetupPromise;
}

// Configure comment rules for all languages (enables Ctrl+/ / Cmd+/ shortcut)
const C_STYLE = { comments: { lineComment: '//', blockComment: ['/*', '*/'] } };
const SHELL_STYLE = { comments: { lineComment: '#', blockComment: null } };
const HTML_STYLE = { comments: { lineComment: null, blockComment: ['<!--', '-->'] } };

const LANGUAGE_COMMENTS: Record<string, monaco.languages.LanguageConfiguration> = {
  ...Object.fromEntries(
    [
      'typescript',
      'javascript',
      'java',
      'kotlin',
      'go',
      'rust',
      'swift',
      'scss',
      'svelte',
      'astro',
      'json',
    ].map((lang) => [lang, C_STYLE])
  ),
  css: { comments: { lineComment: null, blockComment: ['/*', '*/'] } },
  sql: { comments: { lineComment: '--', blockComment: ['/*', '*/'] } },
  ...Object.fromEntries(
    ['python', 'shell', 'yaml', 'graphql', 'ini'].map((lang) => [lang, SHELL_STYLE])
  ),
  ...Object.fromEntries(['html', 'xml', 'markdown'].map((lang) => [lang, HTML_STYLE])),
};

for (const [langId, config] of Object.entries(LANGUAGE_COMMENTS)) {
  try {
    monaco.languages.setLanguageConfiguration(langId, config);
  } catch {
    // Language may not be registered, skip silently
  }
}

// Configure TypeScript compiler options to suppress module resolution errors
// Monaco's TS service can't resolve project-specific paths like @/* aliases
monaco.typescript.typescriptDefaults.setCompilerOptions({
  target: monaco.typescript.ScriptTarget.ESNext,
  module: monaco.typescript.ModuleKind.ESNext,
  moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
  allowNonTsExtensions: true,
  allowSyntheticDefaultImports: true,
  esModuleInterop: true,
  jsx: monaco.typescript.JsxEmit.ReactJSX,
  strict: true,
  skipLibCheck: true,
  noEmit: true,
  // Suppress module not found errors since we can't provide full project context
  noResolve: true,
});

monaco.typescript.javascriptDefaults.setCompilerOptions({
  target: monaco.typescript.ScriptTarget.ESNext,
  module: monaco.typescript.ModuleKind.ESNext,
  moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
  allowNonTsExtensions: true,
  allowSyntheticDefaultImports: true,
  esModuleInterop: true,
  jsx: monaco.typescript.JsxEmit.ReactJSX,
  noResolve: true,
});

// Disable semantic and syntax validation to avoid module resolution errors
// and prevent errors with inmemory:// virtual files used by diff editors
monaco.typescript.typescriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: true,
});

monaco.typescript.javascriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: true,
});

// --- DocumentSymbolProviders for languages without built-in language servers ---

/** Build a DocumentSymbol and push it into the symbols array */
function pushSymbol(
  symbols: monaco.languages.DocumentSymbol[],
  model: monaco.editor.ITextModel,
  name: string,
  detail: string,
  kind: monaco.languages.SymbolKind,
  matchIndex: number,
  matchLength: number,
  nameOffset: number,
  nameLength: number
): void {
  const startPos = model.getPositionAt(matchIndex);
  const endPos = model.getPositionAt(matchIndex + matchLength);
  const nameStart = model.getPositionAt(nameOffset);
  const nameEnd = model.getPositionAt(nameOffset + nameLength);
  symbols.push({
    name,
    detail,
    kind,
    tags: [],
    range: {
      startLineNumber: startPos.lineNumber,
      startColumn: startPos.column,
      endLineNumber: endPos.lineNumber,
      endColumn: endPos.column,
    },
    selectionRange: {
      startLineNumber: nameStart.lineNumber,
      startColumn: nameStart.column,
      endLineNumber: nameEnd.lineNumber,
      endColumn: nameEnd.column,
    },
  });
}

// Java: regex-based extraction of classes, methods, and fields
monaco.languages.registerDocumentSymbolProvider('java', {
  provideDocumentSymbols(model) {
    const text = model.getValue();
    const symbols: monaco.languages.DocumentSymbol[] = [];

    // Match class / interface / enum declarations
    const classRe =
      /^\s*(?:(?:public|private|protected|static|abstract|final)\s+)*(?:class|interface|enum)\s+(\w+)/gm;
    let m: RegExpExecArray | null = classRe.exec(text);
    while (m !== null) {
      const nameIdx = m[0].indexOf(m[1]);
      pushSymbol(
        symbols,
        model,
        m[1],
        '',
        monaco.languages.SymbolKind.Class,
        m.index,
        m[0].length,
        m.index + nameIdx,
        m[1].length
      );
      m = classRe.exec(text);
    }

    // Match method declarations (modifiers + return-type + name + params)
    // Note: 'override' is removed — it is a Java annotation (@Override), not a modifier keyword
    // Negative lookahead before return type prevents access-modifier keywords (public, private, …)
    // from being misread as the return type when the modifiers group matches zero times.
    // Without this, `public VerifySymbols()` would be parsed as: returnType=public, name=VerifySymbols.
    const methodRe =
      /^\s*((?:(?:public|private|protected|static|final|abstract|synchronized|native)\s+)*)(<[^>]+>\s+)?(?!(?:public|private|protected|static|final|abstract|synchronized|native)\b)(\w+(?:\[\])*(?:<(?:[^<>]|<[^<>]*>)*>)?(?:\[\])*)\s+(\w+)\s*\(((?:[^)(]|\([^)]*\))*)\)\s*(?:throws\s+\w+(?:\s*,\s*\w+)*)?\s*(?:\{|;)/gm;
    let methodMatch: RegExpExecArray | null = methodRe.exec(text);
    while (methodMatch !== null) {
      const modifiers = methodMatch[1].trim();
      const returnType = methodMatch[3];
      const methodName = methodMatch[4];
      const params = methodMatch[5].trim();
      const detail = `${modifiers ? `${modifiers} ` : ''}${returnType} (${params})`;
      const nameIdx = methodMatch[0].indexOf(
        methodName,
        (methodMatch[1] + (methodMatch[2] ?? '') + methodMatch[3]).length
      );
      pushSymbol(
        symbols,
        model,
        methodName,
        detail,
        monaco.languages.SymbolKind.Method,
        methodMatch.index,
        methodMatch[0].length,
        methodMatch.index + nameIdx,
        methodName.length
      );
      methodMatch = methodRe.exec(text);
    }

    // Match constructor declarations: optional access modifier + UpperCaseName + ( params )
    // Constructors have no return type; name starts with uppercase (Java convention)
    const ctorRe =
      /^\s*((?:(?:public|private|protected)\s+)*)([A-Z]\w*)\s*\(([^)]*)\)\s*(?:throws\s+[\w,\s]+)?\s*\{/gm;
    let ctorMatch: RegExpExecArray | null = ctorRe.exec(text);
    while (ctorMatch !== null) {
      const ctorName = ctorMatch[2];
      const params = ctorMatch[3].trim();
      // Include params in name so the full signature is visible in the symbol picker
      const displayName = `${ctorName}(${params})`;
      const nameIdx = ctorMatch[0].indexOf(ctorName, (ctorMatch[1] ?? '').length);
      pushSymbol(
        symbols,
        model,
        displayName,
        ctorMatch[1].trim(),
        monaco.languages.SymbolKind.Constructor,
        ctorMatch.index,
        ctorMatch[0].length,
        ctorMatch.index + nameIdx,
        ctorName.length
      );
      ctorMatch = ctorRe.exec(text);
    }

    // Match field declarations (optional modifiers + type + name)
    // Modifiers are optional (*) to support package-private fields like `String name;`
    // Type name must not be a Java keyword to avoid false matches on statements
    const fieldRe =
      /^\s*((?:(?:public|private|protected|static|final|volatile|transient)\s+)*)(?!(?:void|return|new|if|for|while|switch|try|throw|catch|import|class|interface|enum)\b)(\w+(?:<[^>]*>)?(?:\[\])*)\s+(\w+)\s*(?:=|;)/gm;
    let fieldMatch: RegExpExecArray | null = fieldRe.exec(text);
    while (fieldMatch !== null) {
      const modifiers = fieldMatch[1].trim();
      // Without modifiers, skip deeply-indented lines (likely local variables inside methods).
      // Allow single-level indentation: ≤1 tab or ≤4 spaces.
      if (!modifiers) {
        const leadingWs = fieldMatch[0].match(/^\s*/)?.[0] ?? '';
        const tabs = (leadingWs.match(/\t/g) ?? []).length;
        const spaces = leadingWs.replace(/\t/g, '').length;
        if (tabs > 1 || spaces > 4) {
          fieldMatch = fieldRe.exec(text);
          continue;
        }
      }
      const fieldName = fieldMatch[3];
      const typeName = fieldMatch[2];
      const nameIdx = fieldMatch[0].lastIndexOf(fieldName);
      pushSymbol(
        symbols,
        model,
        fieldName,
        typeName,
        monaco.languages.SymbolKind.Field,
        fieldMatch.index,
        fieldMatch[0].length,
        fieldMatch.index + nameIdx,
        fieldName.length
      );
      fieldMatch = fieldRe.exec(text);
    }

    return symbols;
  },
});

// Vue SFC: extract symbols from all <script> and <script setup> blocks
monaco.languages.registerDocumentSymbolProvider('vue', {
  provideDocumentSymbols(model) {
    const text = model.getValue();
    const symbols: monaco.languages.DocumentSymbol[] = [];

    // Collect all <script> blocks (supports both <script> and <script setup>)
    const scriptBlockRe = /<script(\s[^>]*)?>[\s\S]*?<\/script>/gi;
    let blockMatch: RegExpExecArray | null = scriptBlockRe.exec(text);
    while (blockMatch !== null) {
      const blockTag = blockMatch[0];
      const blockAttrs = blockMatch[1] ?? '';
      const isSetup = /\bsetup\b/i.test(blockAttrs);

      // Extract inner content (between opening and closing tag)
      const openTagEnd = blockTag.indexOf('>') + 1;
      const scriptText = blockTag.slice(openTagEnd, blockTag.lastIndexOf('</script>'));
      const scriptOffset = blockMatch.index + openTagEnd;

      if (isSetup) {
        // <script setup>: extract top-level variables and functions
        extractSetupSymbols(scriptText, scriptOffset);
      } else {
        // <script> Options API: extract methods, computed, props, data fields
        extractOptionsApiSymbols(scriptText, scriptOffset);
      }

      blockMatch = scriptBlockRe.exec(text);
    }

    /** Extract symbols from <script setup>: all top-level const/let/var/function declarations */
    function extractSetupSymbols(source: string, offset: number): void {
      // Match: (export) (async) function name
      const fnRe = /(?:^|\n)([ \t]*)(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
      let fm: RegExpExecArray | null = fnRe.exec(source);
      while (fm !== null) {
        const indent = fm[1].length;
        // Only top-level declarations (no indentation inside blocks)
        if (indent === 0) {
          const name = fm[2];
          const nameIdx = fm[0].lastIndexOf(name);
          pushSymbol(
            symbols,
            model,
            name,
            'function',
            monaco.languages.SymbolKind.Function,
            offset + fm.index,
            fm[0].length,
            offset + fm.index + nameIdx,
            name.length
          );
        }
        fm = fnRe.exec(source);
      }

      // Match: (export) const/let/var name = ...
      // Distinguishes arrow functions from regular variables by checking for => after =
      const varRe = /(?:^|\n)([ \t]*)(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*([^\n;,}]*)/g;
      let vm: RegExpExecArray | null = varRe.exec(source);
      while (vm !== null) {
        const indent = vm[1].length;
        if (indent === 0) {
          const name = vm[2];
          const rhs = vm[3].trim();
          // Arrow function: rhs starts with ( or identifier followed by =>
          const isArrow =
            /^(?:\([^)]*\)|\w+)\s*=>/.test(rhs) || /^async\s*(?:\([^)]*\)|\w+)\s*=>/.test(rhs);
          const kind = isArrow
            ? monaco.languages.SymbolKind.Function
            : monaco.languages.SymbolKind.Variable;
          const nameIdx = vm[0].indexOf(name, vm[1].length);
          pushSymbol(
            symbols,
            model,
            name,
            isArrow ? 'arrow function' : 'variable',
            kind,
            offset + vm.index,
            vm[0].length,
            offset + vm.index + nameIdx,
            name.length
          );
        }
        vm = varRe.exec(source);
      }
    }

    /** Extract symbols from Options API <script> block */
    function extractOptionsApiSymbols(source: string, offset: number): void {
      extractSection(source, offset, 'methods', monaco.languages.SymbolKind.Method);
      extractSection(source, offset, 'computed', monaco.languages.SymbolKind.Property);
      extractSection(source, offset, 'props', monaco.languages.SymbolKind.Property);
      extractDataFields(source, offset);
    }

    /**
     * Walk a brace-delimited body and collect only the direct (depth-1) key names.
     * Returns an array of { name, localIndex } where localIndex is the char offset
     * inside `body` where the key identifier starts.
     */
    function collectTopLevelKeys(body: string): { name: string; localIndex: number }[] {
      const keys: { name: string; localIndex: number }[] = [];
      let depth = 0; // 0 = top level inside the body
      let i = 0;
      while (i < body.length) {
        const ch = body[i];

        // Skip line comments: // ...
        if (ch === '/' && body[i + 1] === '/') {
          i += 2;
          while (i < body.length && body[i] !== '\n') i++;
          continue;
        }

        // Skip block comments: /* ... */
        if (ch === '/' && body[i + 1] === '*') {
          i += 2;
          while (i < body.length && !(body[i] === '*' && body[i + 1] === '/')) i++;
          i += 2;
          continue;
        }

        // Skip string literals: '...', "...", `...` (with escape handling)
        if (ch === '"' || ch === "'" || ch === '`') {
          const quote = ch;
          i++;
          while (i < body.length) {
            if (body[i] === '\\') {
              i += 2; // skip escaped character
              continue;
            }
            if (body[i] === quote) {
              i++;
              break;
            }
            i++;
          }
          continue;
        }

        if (ch === '{' || ch === '[' || ch === '(') {
          depth++;
          i++;
          continue;
        }
        if (ch === '}' || ch === ']' || ch === ')') {
          depth--;
          i++;
          continue;
        }
        // Only match keys at depth 0 (direct children)
        if (depth === 0) {
          // Skip whitespace / newlines
          if (/\s/.test(ch)) {
            i++;
            continue;
          }
          // Try to match: (async ) identifier followed by ( or :
          const slice = body.slice(i);
          const keyM = /^(?:async\s+)?([a-zA-Z_$][\w$]*)\s*(?:\(|:)/.exec(slice);
          if (keyM) {
            const name = keyM[1];
            const nameOffset = keyM[0].indexOf(name);
            if (name !== 'return' && name !== 'async') {
              keys.push({ name, localIndex: i + nameOffset });
            }
            // Advance past the identifier to avoid re-matching same position
            i += keyM[0].length - 1;
            continue;
          }
        }
        i++;
      }
      return keys;
    }

    /**
     * Walk from `start` (first char after opening `{`) to find the matching closing `}`,
     * skipping string literals and line/block comments.
     * Returns the index of the closing `}`.
     */
    function findClosingBrace(source: string, start: number): number {
      let depth = 1;
      let i = start;
      while (i < source.length && depth > 0) {
        const ch = source[i];
        // Skip line comments
        if (ch === '/' && source[i + 1] === '/') {
          i += 2;
          while (i < source.length && source[i] !== '\n') i++;
          continue;
        }
        // Skip block comments
        if (ch === '/' && source[i + 1] === '*') {
          i += 2;
          while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i++;
          i += 2;
          continue;
        }
        // Skip string literals: '...', "...", `...`
        if (ch === '"' || ch === "'" || ch === '`') {
          const quote = ch;
          i++;
          while (i < source.length) {
            if (source[i] === '\\') {
              i += 2;
              continue;
            }
            if (source[i] === quote) {
              i++;
              break;
            }
            i++;
          }
          continue;
        }
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        i++;
      }
      return i - 1; // index of the closing '}'
    }

    /** Extract keys from a top-level Options API section like `methods: { ... }` */
    function extractSection(
      source: string,
      offset: number,
      sectionName: string,
      kind: monaco.languages.SymbolKind
    ): void {
      const sectionRe = new RegExp(`\\b${sectionName}\\s*:\\s*\\{`, 'g');
      const sectionMatch = sectionRe.exec(source);
      if (!sectionMatch) return;

      const bodyStart = sectionMatch.index + sectionMatch[0].length;
      const closeIdx = findClosingBrace(source, bodyStart);
      const sectionBody = source.slice(bodyStart, closeIdx);
      const bodyOffset = offset + bodyStart;

      for (const { name, localIndex } of collectTopLevelKeys(sectionBody)) {
        pushSymbol(
          symbols,
          model,
          name,
          sectionName,
          kind,
          bodyOffset + localIndex,
          name.length,
          bodyOffset + localIndex,
          name.length
        );
      }
    }

    /** Extract properties returned from the data() function */
    function extractDataFields(source: string, offset: number): void {
      // Find data() { return { ... } }
      const dataRe = /\bdata\s*\(\s*\)\s*\{[\s\S]*?return\s*\{/g;
      const dataMatch = dataRe.exec(source);
      if (!dataMatch) return;

      const returnBraceIdx = dataMatch.index + dataMatch[0].length - 1; // points to '{'
      const closeIdx = findClosingBrace(source, returnBraceIdx + 1);
      const returnBody = source.slice(returnBraceIdx + 1, closeIdx);
      const returnOffset = offset + returnBraceIdx + 1;

      for (const { name, localIndex } of collectTopLevelKeys(returnBody)) {
        pushSymbol(
          symbols,
          model,
          name,
          'data',
          monaco.languages.SymbolKind.Variable,
          returnOffset + localIndex,
          name.length,
          returnOffset + localIndex,
          name.length
        );
      }
    }

    return symbols;
  },
});

// Java FoldingRangeProvider: covers braces, block comments, imports, line-comment groups, and regions.
// Must be comprehensive because registering ANY FoldingRangeProvider fully replaces IndentRangeProvider.
monaco.languages.registerFoldingRangeProvider('java', {
  provideFoldingRanges(model) {
    const lines = model.getLinesContent();
    return computeJavaFoldingRanges(lines) as monaco.languages.FoldingRange[];
  },
});

// SFC (Single File Component) smart comment support for Vue/Svelte/Astro
const SFC_SECTIONS = ['template', 'script', 'style'] as const;
type SFCSection = (typeof SFC_SECTIONS)[number];
type CommentTokens = { line: string | null; block: [string, string] };

const SFC_COMMENT_TOKENS: Record<SFCSection, CommentTokens> = {
  template: { line: null, block: ['<!--', '-->'] },
  script: { line: '//', block: ['/*', '*/'] },
  style: { line: null, block: ['/*', '*/'] },
};

const SFC_SECTION_REGEXES = {
  template: { open: /<template[^>]*>/gi, close: /<\/template>/i },
  script: { open: /<script[^>]*>/gi, close: /<\/script>/i },
  style: { open: /<style[^>]*>/gi, close: /<\/style>/i },
} as const;

function detectSFCSection(text: string, offset: number): SFCSection {
  const beforeCursor = text.slice(0, offset);
  const afterCursor = text.slice(offset);
  let lastMatch: { type: SFCSection; pos: number } | null = null;

  for (const section of SFC_SECTIONS) {
    const { open, close } = SFC_SECTION_REGEXES[section];
    open.lastIndex = 0;
    const match = open.exec(beforeCursor);
    if (match && close.test(afterCursor)) {
      if (!lastMatch || match.index > lastMatch.pos) {
        lastMatch = { type: section, pos: match.index };
      }
    }
  }
  return lastMatch?.type ?? 'template';
}

const ESCAPED_COMMENT_TOKENS: Record<SFCSection, { line: string | null; block: [string, string] }> =
  {
    template: {
      line: null,
      block: ['<!--', '-->'].map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) as [
        string,
        string,
      ],
    },
    script: {
      line: '//',
      block: ['/*', '*/'].map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) as [string, string],
    },
    style: {
      line: null,
      block: ['/*', '*/'].map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) as [string, string],
    },
  };

function uncommentLine(line: string, tokens: CommentTokens, section: SFCSection): string {
  if (tokens.line) return line.replace(new RegExp(`^(\\s*)${tokens.line}\\s?`), '$1');
  const [open, close] = ESCAPED_COMMENT_TOKENS[section].block;
  return line
    .replace(new RegExp(`^(\\s*)${open}\\s?`), '$1')
    .replace(new RegExp(`\\s?${close}(\\s*)$`), '$1');
}

function commentLine(line: string, tokens: CommentTokens): string {
  const indent = line.match(/^\s*/)?.[0] ?? '';
  const content = line.slice(indent.length);
  return tokens.line
    ? `${indent}${tokens.line} ${content}`
    : `${indent}${tokens.block[0]} ${content} ${tokens.block[1]}`;
}

function registerSFCCommentAction(languageId: string) {
  monaco.editor.addEditorAction({
    id: `${languageId}-toggle-comment`,
    label: 'Toggle Line Comment',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Slash],
    precondition: `editorLangId == ${languageId}`,
    run(editor) {
      const model = editor.getModel();
      if (!model) return;
      const selection = editor.getSelection();
      if (!selection) return;

      const offset = model.getOffsetAt(selection.getStartPosition());
      const section = detectSFCSection(model.getValue(), offset);
      const tokens = SFC_COMMENT_TOKENS[section];
      const startLine = selection.startLineNumber;
      const endLine = selection.endLineNumber;

      let allCommented = true;
      for (let i = startLine; i <= endLine; i++) {
        const trimmed = model.getLineContent(i).trim();
        const isCommented = tokens.line
          ? trimmed.startsWith(tokens.line)
          : trimmed.startsWith(tokens.block[0]) && trimmed.endsWith(tokens.block[1]);
        if (!isCommented) {
          allCommented = false;
          break;
        }
      }

      const edits: monaco.editor.IIdentifiedSingleEditOperation[] = [];
      for (let i = startLine; i <= endLine; i++) {
        const line = model.getLineContent(i);
        const newLine = allCommented
          ? uncommentLine(line, tokens, section)
          : commentLine(line, tokens);
        if (newLine !== line)
          edits.push({ range: new monaco.Range(i, 1, i, line.length + 1), text: newLine });
      }
      editor.executeEdits(`${languageId}-toggle-comment`, edits);
    },
  });
}

['vue', 'svelte', 'astro'].forEach(registerSFCCommentAction);

export type Monaco = typeof monaco;
export { monaco };
