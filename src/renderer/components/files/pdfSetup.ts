import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

export type {
  PageViewport as PDFPageViewport,
  PDFDocumentLoadingTask as PDFLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
} from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface PDFJS {
  getDocument: (params: {
    url?: string;
    data?: Uint8Array;
    cMapUrl?: string;
    cMapPacked?: boolean;
  }) => import('pdfjs-dist').PDFDocumentLoadingTask;
  GlobalWorkerOptions: {
    workerSrc: string;
  };
}

let pdfjsPromise: Promise<PDFJS> | null = null;
let pdfjsInstance: PDFJS | null = null;

export async function getPDFJS(): Promise<PDFJS> {
  if (pdfjsInstance) {
    return pdfjsInstance;
  }

  if (!pdfjsPromise) {
    pdfjsPromise = Promise.resolve()
      .then(() => {
        const loadedPdfjs = pdfjs as PDFJS;
        loadedPdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
        pdfjsInstance = loadedPdfjs;
        return loadedPdfjs;
      })
      .catch((error) => {
        pdfjsPromise = null;
        throw new Error(`Failed to load PDF.js: ${error.message}`);
      });
  }

  return pdfjsPromise;
}
