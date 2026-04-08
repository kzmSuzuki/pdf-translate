const isHeadingPattern = (text) => /^(\d+(\.\d+)*\s+|introduction|conclusion|related work)/i.test(text);

const detectType = (block, context) => {
  const t = block.sourceText;
  if (/^abstract\b/i.test(t)) return 'abstract';
  if (/^(figure|fig\.)\s*\d+/i.test(t)) return 'figureCaption';
  if (/^table\s*\d+/i.test(t)) return 'tableCaption';
  if (context.pageNumber === 1 && context.orderIndex === 0) return 'title';
  if (context.pageNumber === 1 && context.orderIndex < 5 && block.fontSize >= context.medianFont * 0.9) return 'author';
  if (block.fontSize > context.medianFont * 1.15 || isHeadingPattern(t)) return 'heading';
  return 'paragraph';
};

const estimateColumns = (blocks, pageWidth) => {
  const centers = blocks.map((b) => b.bbox[0] + b.bbox[2] / 2);
  const leftCount = centers.filter((x) => x < pageWidth / 2).length;
  const rightCount = centers.length - leftCount;
  return leftCount > 4 && rightCount > 4 ? 2 : 1;
};

export const inferStructure = (parsed) => {
  const pages = parsed.pages.map((page) => {
    const fonts = page.textBlocks.map((b) => b.fontSize || 10);
    const medianFont = fonts.sort((a, b) => a - b)[Math.floor(fonts.length / 2)] || 10;
    const columnCount = estimateColumns(page.textBlocks, page.width);
    const blocks = page.textBlocks.map((b, i) => {
      const columnIndex = columnCount === 1 ? 0 : (b.bbox[0] + b.bbox[2] / 2 < page.width / 2 ? 0 : 1);
      const sourceText = b.text;
      return {
        id: `p${page.pageNumber}-b${i}`,
        pageNumber: page.pageNumber,
        type: detectType({ sourceText, fontSize: b.fontSize }, { pageNumber: page.pageNumber, orderIndex: i, medianFont }),
        bbox: b.bbox,
        sourceText,
        translatedText: '',
        fontSize: b.fontSize,
        fontWeight: b.fontSize > medianFont * 1.1 ? 700 : 400,
        columnIndex,
        orderIndex: i,
      };
    });

    return {
      pageNumber: page.pageNumber,
      width: page.width,
      height: page.height,
      columnCount,
      blocks,
      images: page.images,
      tables: page.tables,
    };
  });

  return {
    document: {
      id: crypto.randomUUID(),
      fileName: '',
      pageCount: parsed.pageCount,
      pageWidth: pages[0]?.width ?? 0,
      pageHeight: pages[0]?.height ?? 0,
      createdAt: new Date().toISOString(),
    },
    pages,
  };
};
