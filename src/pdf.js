import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';

const joinItemsByLine = (items) => {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  const epsilon = 3;

  sorted.forEach((item) => {
    let line = lines.find((entry) => Math.abs(entry.y - item.y) < epsilon);
    if (!line) {
      line = { y: item.y, items: [] };
      lines.push(line);
    }
    line.items.push(item);
  });

  return lines.flatMap((line) => {
    const ordered = line.items.sort((a, b) => a.x - b.x);
    const text = ordered.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();
    if (!text) return [];

    const minX = Math.min(...ordered.map((i) => i.x));
    const maxX = Math.max(...ordered.map((i) => i.x + i.w));
    const minY = Math.min(...ordered.map((i) => i.y - i.h));
    const maxY = Math.max(...ordered.map((i) => i.y));
    const avgFont = ordered.reduce((s, i) => s + i.fontSize, 0) / ordered.length;

    return [{ text, bbox: [minX, minY, maxX - minX, maxY - minY], fontSize: avgFont }];
  });
};

export const parsePdf = async (arrayBuffer, onProgress) => {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const viewport = page.getViewport({ scale: 1 });
    const textContent = await page.getTextContent();

    const items = textContent.items.map((item) => {
      const [, , , , x, y] = item.transform;
      const fontSize = Math.hypot(item.transform[2], item.transform[3]) || 10;
      return {
        str: item.str,
        x,
        y,
        w: item.width || item.str.length * fontSize * 0.5,
        h: item.height || fontSize,
        fontSize,
      };
    });

    const textBlocks = joinItemsByLine(items);
    pages.push({
      pageNumber: pageIndex,
      width: viewport.width,
      height: viewport.height,
      rawTextCount: items.map((i) => i.str).join('').trim().length,
      textBlocks,
      images: [],
      tables: [],
    });

    onProgress?.(pageIndex, pdf.numPages);
  }

  return {
    pageCount: pdf.numPages,
    pages,
  };
};
