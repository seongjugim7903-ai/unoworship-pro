import { getCanvasPurpose, type CanvasPurpose } from './canvasPurpose';
import type { CanvasPage, CanvasProject } from './canvasStore';
import type { CanvasElement } from '@/lib/canvasTypes';
import { preloadImages, renderElements } from '@/lib/canvasRenderer';

const MM_PER_INCH = 25.4;
const EDITOR_BASE_WIDTH = 1920;

export type CanvasPngExportResult = {
  blob: Blob;
  url: string;
  widthPx: number;
  heightPx: number;
  widthMm?: number;
  heightMm?: number;
  dpi: number;
  fileName: string;
  pageName?: string;
};

export async function exportCanvasProjectToPng(
  project: CanvasProject,
  dpi = 300,
  pageId?: string,
): Promise<CanvasPngExportResult> {
  const page = pageId
    ? project.pages.find((candidate) => candidate.id === pageId) ?? project.pages[0]
    : project.pages[0];
  if (!page) throw new Error('내보낼 페이지가 없습니다.');

  const purpose = getCanvasPurpose(project.purposeId);
  return exportCanvasPageToPng(project, page, purpose, dpi);
}

async function exportCanvasPageToPng(
  project: CanvasProject,
  page: CanvasPage,
  purpose: CanvasPurpose | null,
  dpi: number,
): Promise<CanvasPngExportResult> {
  const isMmCanvas = purpose?.unit === 'mm';
  const widthPx = isMmCanvas ? mmToPx(page.width, dpi) : Math.round(page.width);
  const heightPx = isMmCanvas ? mmToPx(page.height, dpi) : Math.round(page.height);

  const canvas = document.createElement('canvas');
  canvas.width = widthPx;
  canvas.height = heightPx;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 컨텍스트를 만들 수 없습니다.');

  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  const exportElements = scaleElementsForExport(page.elements, widthPx / EDITOR_BASE_WIDTH);
  await preloadImages(exportElements);

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, widthPx, heightPx);
  renderElements(ctx, exportElements, '', widthPx, heightPx);
  ctx.restore();

  const blob = await canvasToBlob(canvas, 'image/png');
  const url = URL.createObjectURL(blob);

  return {
    blob,
    url,
    widthPx,
    heightPx,
    widthMm: isMmCanvas ? page.width : undefined,
    heightMm: isMmCanvas ? page.height : undefined,
    dpi,
    fileName: buildFileName(project, purpose, dpi, 'png', page.name, project.pages.length > 1),
    pageName: page.name,
  };
}

export async function downloadCanvasProjectAsPng(project: CanvasProject, dpi = 300, pageId?: string) {
  const result = await exportCanvasProjectToPng(project, dpi, pageId);
  const link = document.createElement('a');
  link.href = result.url;
  link.download = result.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(result.url), 3000);
  return result;
}

export async function openCanvasProjectPdfPrintWindow(project: CanvasProject, dpi = 300) {
  const purpose = getCanvasPurpose(project.purposeId);
  const pages = project.pages.length > 0 ? project.pages : [];
  if (pages.length === 0) throw new Error('PDF로 내보낼 페이지가 없습니다.');

  const results = await Promise.all(
    pages.map((page) => exportCanvasPageToPng(project, page, purpose, dpi)),
  );

  const firstResult = results[0];
  const widthMm = firstResult.widthMm ?? purpose?.canvasWidth;
  const heightMm = firstResult.heightMm ?? purpose?.canvasHeight;
  if (!widthMm || !heightMm) {
    throw new Error('PDF 출력용 실제 크기를 알 수 없습니다.');
  }

  const win = window.open('', '_blank');
  if (!win) {
    throw new Error('PDF 출력 창을 열 수 없습니다. 팝업 차단을 확인해 주세요.');
  }

  const escapedName = escapeHtml(project.name || '제목 없는 디자인');
  const imageMarkup = results.map((result, index) => `
  <section class="pdf-page">
    <img src="${result.url}" alt="${escapeHtml(result.pageName || `${escapedName} ${index + 1}`)}" />
  </section>`).join('');

  win.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapedName} PDF 출력</title>
  <style>
    @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
    html, body {
      width: ${widthMm}mm;
      height: ${heightMm}mm;
      margin: 0;
      padding: 0;
      background: #fff;
    }
    img {
      display: block;
      width: ${widthMm}mm;
      height: ${heightMm}mm;
      object-fit: fill;
    }
    .pdf-page {
      width: ${widthMm}mm;
      height: ${heightMm}mm;
      page-break-after: always;
      break-after: page;
    }
    .pdf-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    @media screen {
      body {
        min-height: 100vh;
        background: #f3f4f6;
        padding: 24px;
        box-sizing: border-box;
      }
      .pdf-page {
        margin: 0 auto 24px;
      }
      img {
        box-shadow: 0 18px 60px rgba(15, 23, 42, 0.18);
      }
    }
  </style>
</head>
<body>
${imageMarkup}
  <script>
    window.addEventListener('load', () => {
      setTimeout(() => window.print(), 300);
    });
  </script>
</body>
</html>`);
  win.document.close();

  return firstResult;
}

function mmToPx(mm: number, dpi: number) {
  return Math.round((mm / MM_PER_INCH) * dpi);
}

function scaleElementsForExport(elements: CanvasElement[], scale: number): CanvasElement[] {
  return elements.map((element) => {
    if (element.type === 'text') {
      return {
        ...element,
        fontSize: element.fontSize * scale,
        letterSpacing: element.letterSpacing * scale,
        strokeWidth: element.strokeWidth * scale,
        shadow: element.shadow
          ? {
              ...element.shadow,
              offsetX: element.shadow.offsetX * scale,
              offsetY: element.shadow.offsetY * scale,
              blur: element.shadow.blur * scale,
            }
          : element.shadow,
      };
    }

    if (element.type === 'shape') {
      return {
        ...element,
        strokeWidth: element.strokeWidth * scale,
        cornerRadius: element.cornerRadius * scale,
        cornerRadii: element.cornerRadii
          ? element.cornerRadii.map((radius) => radius * scale) as [number, number, number, number]
          : element.cornerRadii,
        shadow: element.shadow
          ? {
              ...element.shadow,
              offsetX: element.shadow.offsetX * scale,
              offsetY: element.shadow.offsetY * scale,
              blur: element.shadow.blur * scale,
              spread: element.shadow.spread * scale,
            }
          : element.shadow,
        glow: element.glow
          ? {
              ...element.glow,
              blur: element.glow.blur * scale,
            }
          : element.glow,
      };
    }

    if (element.type === 'image') {
      return {
        ...element,
        strokeWidth: element.strokeWidth ? element.strokeWidth * scale : element.strokeWidth,
        cornerRadius: element.cornerRadius ? element.cornerRadius * scale : element.cornerRadius,
        cornerRadii: element.cornerRadii
          ? element.cornerRadii.map((radius) => radius * scale) as [number, number, number, number]
          : element.cornerRadii,
        shadow: element.shadow
          ? {
              ...element.shadow,
              offsetX: element.shadow.offsetX * scale,
              offsetY: element.shadow.offsetY * scale,
              blur: element.shadow.blur * scale,
              spread: element.shadow.spread * scale,
            }
          : element.shadow,
        glow: element.glow
          ? {
              ...element.glow,
              blur: element.glow.blur * scale,
            }
          : element.glow,
      };
    }

    return element;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('이미지 파일을 만들 수 없습니다.'));
    }, type);
  });
}

function buildFileName(
  project: CanvasProject,
  purpose: CanvasPurpose | null,
  dpi: number,
  ext: string,
  pageName?: string,
  includePageName = false,
) {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, '');
  const purposeLabel = purpose?.label ?? 'canvas';
  const name = project.name || 'untitled';
  const pagePart = includePageName && pageName ? `_${sanitizeFileName(pageName)}` : '';
  return `${stamp}_${sanitizeFileName(name)}_${sanitizeFileName(purposeLabel)}${pagePart}_${dpi}dpi.${ext}`;
}

function sanitizeFileName(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '_')
    .slice(0, 80);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return map[char] ?? char;
  });
}
