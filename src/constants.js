export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const PAGE_WARN_LIMIT = 20;

export const STORAGE_KEYS = {
  settings: 'app.settings',
  meta: 'session.meta',
  extracted: 'session.extracted',
  translated: 'session.translated',
  layout: 'session.layout',
};

export const STATUS = {
  IDLE: '待機中',
  VALIDATING: 'PDF基本検証中',
  ANALYZING: 'PDF解析中',
  STRUCTURING: '文書構造推定中',
  TRANSLATING: '翻訳中',
  RECONSTRUCTING: 'レイアウト再構成中',
  PREPARING: 'PDF生成準備中',
  DONE: '完了',
};
