import { useEffect, useState } from 'react';
import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import themeVitesseDark from 'shiki/themes/vitesse-dark.mjs';
import themeVitesseLight from 'shiki/themes/vitesse-light.mjs';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';

// 常用语言的动态导入
const LANG_LOADERS: Record<string, () => Promise<unknown>> = {
  javascript: () => import('shiki/langs/javascript.mjs'),
  typescript: () => import('shiki/langs/typescript.mjs'),
  jsx: () => import('shiki/langs/jsx.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  bash: () => import('shiki/langs/bash.mjs'),
  shell: () => import('shiki/langs/shell.mjs'),
  sh: () => import('shiki/langs/shell.mjs'),
  go: () => import('shiki/langs/go.mjs'),
  rust: () => import('shiki/langs/rust.mjs'),
  java: () => import('shiki/langs/java.mjs'),
  c: () => import('shiki/langs/c.mjs'),
  cpp: () => import('shiki/langs/cpp.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  diff: () => import('shiki/langs/diff.mjs'),
};

// 语言别名映射
const LANG_ALIASES: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  rb: 'ruby',
  yml: 'yaml',
  md: 'markdown',
  sh: 'shell',
  zsh: 'shell',
};

// 单例 highlighter
let highlighterPromise: Promise<HighlighterCore> | null = null;
const loadedLangs = new Set<string>();

async function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [themeVitesseDark, themeVitesseLight],
      langs: [],
      engine: createJavaScriptRegexEngine(),
    });
  }
  return highlighterPromise;
}

async function loadLanguage(highlighter: HighlighterCore, lang: string): Promise<string | null> {
  const normalizedLang = LANG_ALIASES[lang] || lang;
  const loader = LANG_LOADERS[normalizedLang];

  if (!loader) {
    return null;
  }

  if (!loadedLangs.has(normalizedLang)) {
    try {
      const langModule = await loader();
      await highlighter.loadLanguage(langModule as Parameters<typeof highlighter.loadLanguage>[0]);
      loadedLangs.add(normalizedLang);
    } catch {
      return null;
    }
  }

  return normalizedLang;
}

interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
}

export function CodeBlock({ code, language, className }: CodeBlockProps) {
  const theme = useSettingsStore((s) => s.theme);
  const [html, setHtml] = useState<string | null>(null);

  const resolvedTheme =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme === 'dark'
        ? 'dark'
        : 'light';

  useEffect(() => {
    let cancelled = false;

    async function highlight() {
      if (!code.trim()) {
        setHtml(null);
        return;
      }

      try {
        const highlighter = await getHighlighter();
        const shikiTheme = resolvedTheme === 'dark' ? 'vitesse-dark' : 'vitesse-light';

        let lang: string | null = null;
        if (language) {
          lang = await loadLanguage(highlighter, language);
        }

        if (cancelled) return;

        const result = highlighter.codeToHtml(code, {
          lang: lang || 'text',
          theme: shikiTheme,
        });

        if (!cancelled) {
          setHtml(result);
        }
      } catch {
        if (!cancelled) {
          setHtml(null);
        }
      }
    }

    highlight();

    return () => {
      cancelled = true;
    };
  }, [code, language, resolvedTheme]);

  if (!html) {
    return (
      <pre
        className={cn('overflow-x-auto rounded-lg border border-border bg-muted/50 p-4', className)}
      >
        <code className="block font-mono text-sm leading-relaxed">{code}</code>
      </pre>
    );
  }

  return (
    <div
      className={cn(
        'overflow-x-auto rounded-lg border border-border bg-muted/50',
        '[&>pre]:!bg-transparent [&>pre]:p-4 [&>pre]:m-0 [&>pre]:text-sm [&>pre]:leading-snug [&>pre]:w-fit [&>pre]:min-w-full',
        '[&_code]:block [&_code]:leading-snug',
        '[&_.line]:leading-snug',
        className
      )}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: shiki output is safe
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
