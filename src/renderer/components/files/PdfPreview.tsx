import { ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { toLocalFileUrl } from '@/lib/localFileUrl';
import { pdfPreviewI18nKeys } from '@/lib/uiTranslationKeys';
import { cn } from '@/lib/utils';
import { getPDFJS, type PDFDocumentProxy, type PDFLoadingTask } from './pdfSetup';

interface PdfPreviewProps {
  path: string;
}

type ZoomMode = 'fit-width' | 'fit-page' | 'custom';

export function PdfPreview({ path }: PdfPreviewProps) {
  const { t } = useI18n();
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit-width');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const loadingTaskRef = useRef<PDFLoadingTask | null>(null);

  // Convert file path to local-file:// URL (Electron custom protocol)
  const pdfUrl = useMemo(() => {
    return toLocalFileUrl(path);
  }, [path]);

  const cancelInFlightWork = useCallback(() => {
    renderTaskRef.current?.cancel();
    renderTaskRef.current = null;
    loadingTaskRef.current?.cancel?.();
    void loadingTaskRef.current?.destroy?.();
    loadingTaskRef.current = null;
  }, []);

  // Load the PDF document.
  useEffect(() => {
    let cancelled = false;
    let currentDoc: PDFDocumentProxy | null = null;

    async function loadPDF() {
      setLoading(true);
      setError(null);

      try {
        const pdfjs = await getPDFJS();
        cancelInFlightWork();

        // Load the PDF via the local-file protocol.
        const loadingTask = pdfjs.getDocument({
          url: pdfUrl,
        });
        loadingTaskRef.current = loadingTask;

        const doc = await loadingTask.promise;
        currentDoc = doc;

        if (loadingTaskRef.current === loadingTask) {
          loadingTaskRef.current = null;
        }

        if (cancelled) {
          await doc.destroy().catch(() => {});
          return;
        }

        setPdfDoc(doc);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t(pdfPreviewI18nKeys.loadFailed));
          setLoading(false);
        }
      }
    }

    loadPDF();

    return () => {
      cancelled = true;
      cancelInFlightWork();
      // Dispose the previous PDF document.
      if (currentDoc) {
        void currentDoc.destroy();
      }
    };
  }, [cancelInFlightWork, pdfUrl, t]);

  // Render the active page.
  const renderPage = useCallback(
    async (pageNum: number, targetScale?: number) => {
      if (!pdfDoc || !canvasRef.current || !containerRef.current) return;

      // Cancel the previous render task.
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }

      setRendering(true);

      try {
        const page = await pdfDoc.getPage(pageNum);
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        if (!context) return;

        // Compute the effective scale.
        let finalScale = targetScale ?? scale;
        const viewport = page.getViewport({ scale: 1 });

        if (zoomMode === 'fit-width') {
          const containerWidth = containerRef.current.clientWidth - 32; // Subtract padding.
          finalScale = containerWidth / viewport.width;
        } else if (zoomMode === 'fit-page') {
          const containerWidth = containerRef.current.clientWidth - 32;
          const containerHeight = containerRef.current.clientHeight - 100; // Subtract toolbar and padding.
          const widthScale = containerWidth / viewport.width;
          const heightScale = containerHeight / viewport.height;
          finalScale = Math.min(widthScale, heightScale);
        }

        const scaledViewport = page.getViewport({ scale: finalScale });

        // Update canvas size.
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;

        // Render the page.
        const renderTask = page.render({
          canvasContext: context,
          viewport: scaledViewport,
        });

        renderTaskRef.current = renderTask;
        await renderTask.promise;
        if (renderTaskRef.current === renderTask) {
          renderTaskRef.current = null;
        }

        if (targetScale !== undefined) {
          setScale(finalScale);
        }

        setRendering(false);
      } catch (err) {
        if (renderTaskRef.current) {
          renderTaskRef.current = null;
        }
        if (err instanceof Error && err.message.includes('cancel')) {
          // Ignore expected cancellation errors.
          return;
        }
        setError(err instanceof Error ? err.message : t(pdfPreviewI18nKeys.renderFailed));
        setRendering(false);
      }
    },
    [pdfDoc, scale, t, zoomMode]
  );

  // Re-render when the page or zoom mode changes.
  useEffect(() => {
    if (pdfDoc && currentPage) {
      renderPage(currentPage);
    }
  }, [currentPage, pdfDoc, renderPage]);

  // Re-render on container resize while auto-fitting.
  useEffect(() => {
    if (!containerRef.current || zoomMode === 'custom') return;

    const observer = new ResizeObserver(() => {
      if (pdfDoc && currentPage) {
        renderPage(currentPage);
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [pdfDoc, currentPage, zoomMode, renderPage]);

  // Page navigation.
  const goToPage = (page: number) => {
    if (!pdfDoc) return;
    const targetPage = Math.max(1, Math.min(page, pdfDoc.numPages));
    setCurrentPage(targetPage);
  };

  // Zoom controls.
  const handleZoomIn = () => {
    setZoomMode('custom');
    setScale((prev) => Math.min(prev * 1.2, 5));
    if (pdfDoc) renderPage(currentPage, scale * 1.2);
  };

  const handleZoomOut = () => {
    setZoomMode('custom');
    setScale((prev) => Math.max(prev / 1.2, 0.1));
    if (pdfDoc) renderPage(currentPage, scale / 1.2);
  };

  const handleFitWidth = () => {
    setZoomMode('fit-width');
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-muted/30">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <div className="text-sm text-muted-foreground">{t(pdfPreviewI18nKeys.loading)}</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-muted/30">
        <div className="text-sm text-destructive">{error}</div>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          {t(pdfPreviewI18nKeys.retry)}
        </Button>
      </div>
    );
  }

  if (!pdfDoc) return null;

  return (
    <div
      ref={containerRef}
      className="relative flex h-full flex-col items-center bg-muted/30 overflow-hidden"
    >
      {/* Toolbar */}
      <div className="flex h-12 w-full shrink-0 items-center justify-between border-b bg-background px-4">
        {/* Page navigation */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1 || rendering}
            className="h-7"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm text-muted-foreground">
            {currentPage} / {pdfDoc.numPages}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= pdfDoc.numPages || rendering}
            className="h-7"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomOut}
            disabled={rendering}
            className="h-7"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            variant={zoomMode === 'fit-width' ? 'default' : 'ghost'}
            size="sm"
            onClick={handleFitWidth}
            disabled={rendering}
            className="h-7 text-xs"
          >
            {t(pdfPreviewI18nKeys.fitWidth)}
          </Button>
          <div className="text-sm text-muted-foreground">{Math.round(scale * 100)}%</div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleZoomIn}
            disabled={rendering}
            className="h-7"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* PDF canvas */}
      <div className="relative flex-1 overflow-auto p-4">
        <canvas
          ref={canvasRef}
          className={cn(
            'mx-auto rounded-lg border border-border/70 bg-background',
            rendering && 'opacity-50 transition-opacity duration-200'
          )}
        />
        {rendering && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
