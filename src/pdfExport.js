import { PDFDocument, StandardFonts, rgb } from 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm';

const wrapText = (text, maxChars) => {
  if (!text) return [''];
  const words = text.split(' ');
  const lines = [];
  let line = '';
  words.forEach((word) => {
    const candidate = `${line} ${word}`.trim();
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });
  if (line) lines.push(line);
  return lines;
};

export const buildTranslatedPdf = async (meta, pages) => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  pages.forEach((pageData) => {
    const page = doc.addPage([pageData.width, pageData.height]);
    page.drawRectangle({ x: 0, y: 0, width: pageData.width, height: pageData.height, color: rgb(1, 1, 1) });

    pageData.blocks.forEach((block) => {
      const [x, y, w, h] = block.bbox;
      const fontSize = block.renderedFontSize || 10;
      const maxChars = Math.max(8, Math.floor(w / (fontSize * 0.55)));
      const lines = wrapText(block.translatedText, maxChars);
      const startY = pageData.height - y - fontSize;

      lines.forEach((line, i) => {
        const py = startY - i * (block.lineHeight || fontSize * 1.2);
        if (py < pageData.height - y - h) return;
        page.drawText(line, {
          x,
          y: py,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        });
      });
    });
  });

  const bytes = await doc.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const fileName = meta.fileName.replace(/\.pdf$/i, '') + '_ja_translated.pdf';
  return { url, fileName };
};
