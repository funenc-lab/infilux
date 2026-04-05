import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';

const MERMAID_CDN_URL = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

interface MermaidAPI {
  initialize: (config: {
    startOnLoad: boolean;
    theme: string;
    securityLevel: string;
    fontFamily: string;
    suppressErrorRendering: boolean;
  }) => void;
  render: (id: string, code: string) => Promise<{ svg: string }>;
}

let mermaidPromise: Promise<MermaidAPI> | null = null;
let mermaidInstance: MermaidAPI | null = null;

async function getMermaid(): Promise<MermaidAPI> {
  if (mermaidInstance) {
    return mermaidInstance;
  }

  if (!mermaidPromise) {
    mermaidPromise = import(/* @vite-ignore */ MERMAID_CDN_URL).then((mod) => {
      mermaidInstance = mod.default as MermaidAPI;
      return mermaidInstance;
    });
  }

  return mermaidPromise;
}

interface MermaidRendererProps {
  code: string;
  className?: string;
}

export function MermaidRenderer({ code, className }: MermaidRendererProps) {
  const theme = useSettingsStore((s) => s.theme);
  const uniqueId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolvedTheme =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme === 'dark'
        ? 'dark'
        : 'light';

  const mermaidTheme = resolvedTheme === 'dark' ? 'dark' : 'default';

  useEffect(() => {
    let cancelled = false;
    const elementId = `mermaid-${uniqueId.replace(/:/g, '-')}`;

    function cleanupMermaidElements() {
      const tempElement = document.getElementById(elementId);
      if (tempElement) {
        tempElement.remove();
      }
      const errorElements = document.querySelectorAll(`[id^="${elementId}"]`);
      errorElements.forEach((el) => {
        el.remove();
      });
    }

    async function renderDiagram() {
      if (!code.trim()) {
        setSvg(null);
        setError(null);
        return;
      }

      try {
        const mermaid = await getMermaid();

        mermaid.initialize({
          startOnLoad: false,
          theme: mermaidTheme,
          securityLevel: 'strict',
          fontFamily: 'inherit',
          suppressErrorRendering: true,
        });

        const { svg: renderedSvg } = await mermaid.render(elementId, code);

        cleanupMermaidElements();

        if (!cancelled) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (err) {
        cleanupMermaidElements();

        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Mermaid render failed');
          setSvg(null);
        }
      }
    }

    renderDiagram();

    return () => {
      cancelled = true;
      cleanupMermaidElements();
    };
  }, [code, mermaidTheme, uniqueId]);

  if (error) {
    return (
      <div className={cn('overflow-x-auto rounded-lg border border-destructive/50', className)}>
        <div className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <span>Mermaid 渲染错误</span>
        </div>
        <pre className="p-4 text-sm">
          <code className="block font-mono leading-relaxed text-muted-foreground">{code}</code>
        </pre>
        <div className="border-t border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          {error}
        </div>
      </div>
    );
  }

  if (!svg) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-lg border border-border bg-muted/30 p-8',
          className
        )}
      >
        <div className="text-sm text-muted-foreground">加载 Mermaid 图表...</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'overflow-x-auto rounded-lg border border-border bg-muted/30 p-4',
        '[&_svg]:mx-auto [&_svg]:max-w-full',
        className
      )}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid SVG output
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
