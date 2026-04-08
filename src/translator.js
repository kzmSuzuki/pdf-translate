const dictionary = new Map([
  ['this paper', '本論文'],
  ['we propose', '我々は提案する'],
  ['results', '結果'],
  ['method', '手法'],
  ['introduction', '序論'],
  ['conclusion', '結論'],
  ['figure', '図'],
  ['table', '表'],
  ['abstract', '要旨'],
]);

const splitLongText = (text, maxLen = 280) => {
  if (text.length <= maxLen) return [text];
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let buffer = '';
  sentences.forEach((s) => {
    if ((buffer + s).length > maxLen && buffer) {
      chunks.push(buffer.trim());
      buffer = s;
    } else {
      buffer += ` ${s}`;
    }
  });
  if (buffer.trim()) chunks.push(buffer.trim());
  return chunks;
};

const literalTranslate = (text) => {
  let out = text;
  dictionary.forEach((value, key) => {
    out = out.replace(new RegExp(key, 'gi'), value);
  });
  return out;
};

const preserveMath = (text) => {
  const formulas = [];
  const masked = text.replace(/\$[^$]+\$|\([^)]*=+[^)]*\)/g, (m) => {
    const token = `__FORMULA_${formulas.length}__`;
    formulas.push(m);
    return token;
  });
  return { masked, formulas };
};

export const createTranslator = () => ({
  name: 'LocalLiteralTranslatorV1',
  async translateBlock(block) {
    if (['other'].includes(block.type)) return block.sourceText;
    const { masked, formulas } = preserveMath(block.sourceText);
    const parts = splitLongText(masked);
    const translated = parts.map((p) => literalTranslate(p)).join(' ');
    return formulas.reduce((acc, f, i) => acc.replace(`__FORMULA_${i}__`, f), translated);
  },
});
