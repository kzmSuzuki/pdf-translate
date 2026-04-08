const MIN_FONT_SIZE = 8;

const estimateLines = (text, boxWidth, fontSize) => {
  const charsPerLine = Math.max(6, Math.floor(boxWidth / (fontSize * 0.9)));
  return Math.ceil(text.length / charsPerLine);
};

export const reconstructLayout = (structured) => {
  const warnings = [];

  const pages = structured.pages.map((page) => {
    let yPush = 0;
    const blocks = page.blocks.map((block) => {
      const translated = block.translatedText || block.sourceText;
      let fontSize = block.fontSize;
      let lineHeight = fontSize * 1.3;
      let [, y, width, height] = block.bbox;
      y += yPush;

      let lines = estimateLines(translated, width, fontSize);
      let neededHeight = lines * lineHeight;

      if (neededHeight > height) {
        while (neededHeight > height && fontSize > MIN_FONT_SIZE) {
          fontSize -= 0.5;
          lineHeight = fontSize * 1.2;
          lines = estimateLines(translated, width, fontSize);
          neededHeight = lines * lineHeight;
        }

        if (neededHeight > height) {
          const expandBy = neededHeight - height;
          height = neededHeight;
          yPush += expandBy;
          warnings.push({
            type: 'warn',
            text: `${page.pageNumber}ページ目: テキストボックス高さを自動拡張しました。`,
          });
        }
      }

      return {
        ...block,
        translatedText: translated,
        bbox: [block.bbox[0], y, width, height],
        renderedFontSize: fontSize,
        lineHeight,
      };
    });

    return {
      ...page,
      blocks,
    };
  });

  return { pages, warnings };
};
