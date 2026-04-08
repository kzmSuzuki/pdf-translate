import { MAX_FILE_SIZE, PAGE_WARN_LIMIT, STATUS } from './constants.js';
import { parsePdf } from './pdf.js';
import { inferStructure } from './structure.js';
import { createTranslator } from './translator.js';
import { reconstructLayout } from './layout.js';
import { buildTranslatedPdf } from './pdfExport.js';
import { restoreSession, saveSession, resetSessionStorage } from './storage.js';

const state = {
  file: null,
  mode: 'source',
  page: 1,
  messages: [],
  session: null,
  settings: { tab: 'source', zoom: 1 },
  pdfDownload: null,
};

const els = {
  fileInput: document.querySelector('#file-input'),
  dropzone: document.querySelector('#dropzone'),
  startBtn: document.querySelector('#start-btn'),
  restoreBtn: document.querySelector('#restore-btn'),
  resetBtn: document.querySelector('#reset-btn'),
  statusText: document.querySelector('#status-text'),
  progress: document.querySelector('#progress'),
  progressDetail: document.querySelector('#progress-detail'),
  pageList: document.querySelector('#page-list'),
  preview: document.querySelector('#preview'),
  messages: document.querySelector('#messages'),
  tabSource: document.querySelector('#tab-source'),
  tabTranslated: document.querySelector('#tab-translated'),
  downloadBtn: document.querySelector('#download-btn'),
  reprocessBtn: document.querySelector('#reprocess-btn'),
};

const addMessage = (type, text) => {
  state.messages.push({ type, text });
  renderMessages();
};

const setStatus = (text, progress = null, detail = '') => {
  els.statusText.textContent = text;
  if (progress !== null) els.progress.value = progress;
  els.progressDetail.textContent = detail;
};

const renderMessages = () => {
  els.messages.innerHTML = '';
  state.messages.forEach((m) => {
    const li = document.createElement('li');
    li.className = m.type;
    li.textContent = m.text;
    els.messages.append(li);
  });
};

const validateFile = (file) => {
  if (!file) return false;
  if (!/\.pdf$/i.test(file.name) || file.type && file.type !== 'application/pdf') {
    addMessage('error', '非PDFファイルは読み込めません。');
    return false;
  }
  if (file.size > MAX_FILE_SIZE) {
    addMessage('error', 'ファイルサイズが上限を超えています（10MBまで）。');
    return false;
  }
  return true;
};

const isLikelyScannedPdf = (pages) => {
  const sample = pages.slice(0, 3);
  const totalChars = sample.reduce((sum, p) => sum + p.rawTextCount, 0);
  return totalChars < 80;
};

const renderPageList = () => {
  els.pageList.innerHTML = '';
  const pages = state.session?.layout?.pages ?? [];
  pages.forEach((page) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.textContent = `Page ${page.pageNumber}`;
    btn.addEventListener('click', () => {
      state.page = page.pageNumber;
      renderPreview();
    });
    li.append(btn);
    els.pageList.append(li);
  });
};

const renderPreview = () => {
  els.preview.innerHTML = '';
  const page = state.session?.layout?.pages?.find((p) => p.pageNumber === state.page);
  if (!page) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'page-canvas';
  canvas.width = page.width;
  canvas.height = page.height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#e5e7eb';
  ctx.strokeRect(0, 0, canvas.width, canvas.height);

  const blocks = page.blocks;
  blocks.forEach((block) => {
    const text = state.mode === 'source' ? block.sourceText : block.translatedText;
    const [x, y, w, h] = block.bbox;
    ctx.save();
    ctx.fillStyle = '#111827';
    const size = Math.max(8, (state.mode === 'source' ? block.fontSize : block.renderedFontSize) || 10);
    ctx.font = `${size}px sans-serif`;

    const maxChars = Math.max(8, Math.floor(w / (size * 0.9)));
    const chunks = [];
    let line = '';
    text.split(' ').forEach((word) => {
      const c = `${line} ${word}`.trim();
      if (c.length > maxChars && line) {
        chunks.push(line);
        line = word;
      } else {
        line = c;
      }
    });
    if (line) chunks.push(line);
    chunks.forEach((c, i) => {
      const py = y + size + i * ((block.lineHeight || size * 1.2));
      if (py > y + h) return;
      ctx.fillText(c, x, py);
    });
    ctx.restore();
  });

  els.preview.append(canvas);
};

const switchTab = (mode) => {
  state.mode = mode;
  els.tabSource.classList.toggle('active', mode === 'source');
  els.tabTranslated.classList.toggle('active', mode === 'translated');
  state.settings.tab = mode;
  renderPreview();
};

const processPdf = async () => {
  if (!state.file || !validateFile(state.file)) return;
  state.messages = [];
  renderMessages();

  setStatus(STATUS.VALIDATING, 5, 'ファイル検証中');
  const buffer = await state.file.arrayBuffer();

  setStatus(STATUS.ANALYZING, 15, 'ページ解析を開始します');
  let parsed;
  try {
    parsed = await parsePdf(buffer, (done, total) => {
      const pct = 15 + Math.round((done / total) * 30);
      setStatus(STATUS.ANALYZING, pct, `${done}/${total} ページ解析済み`);
    });
  } catch (error) {
    addMessage('error', 'PDF解析に失敗しました。');
    console.error(error);
    return;
  }

  if (parsed.pageCount > PAGE_WARN_LIMIT) {
    addMessage('warn', 'ページ数が20ページを超えています。処理に時間がかかる可能性があります。');
  }

  if (isLikelyScannedPdf(parsed.pages)) {
    addMessage('error', 'このPDFはテキスト抽出に対応していません。スキャン画像PDFは現在非対応です。');
    setStatus(STATUS.IDLE, 0, '非対応PDFのため処理を停止しました');
    return;
  }

  setStatus(STATUS.STRUCTURING, 50, '文書構造を推定中');
  const structured = inferStructure(parsed);
  structured.document.fileName = state.file.name;

  setStatus(STATUS.TRANSLATING, 60, '翻訳中');
  const translator = createTranslator();
  const blocks = structured.pages.flatMap((p) => p.blocks);
  for (let i = 0; i < blocks.length; i += 1) {
    blocks[i].translatedText = await translator.translateBlock(blocks[i]);
    const pct = 60 + Math.round(((i + 1) / blocks.length) * 20);
    setStatus(STATUS.TRANSLATING, pct, `${i + 1}/${blocks.length} ブロック翻訳済み`);
  }

  setStatus(STATUS.RECONSTRUCTING, 85, 'レイアウト再構成中');
  const layoutResult = reconstructLayout(structured);
  layoutResult.warnings.forEach((w) => addMessage(w.type, w.text));

  setStatus(STATUS.PREPARING, 92, 'PDF生成準備中');
  state.session = {
    meta: {
      fileName: state.file.name,
      loadedAt: new Date().toISOString(),
      pageCount: parsed.pageCount,
    },
    extracted: structured,
    translated: {
      engine: translator.name,
      pages: structured.pages,
    },
    layout: {
      pages: layoutResult.pages,
    },
  };

  saveSession(state.session, state.settings, state.messages);

  state.page = 1;
  renderPageList();
  renderPreview();
  els.downloadBtn.disabled = false;
  els.reprocessBtn.disabled = false;
  setStatus(STATUS.DONE, 100, '処理が完了しました');
};

const onFileSelected = (file) => {
  state.file = file;
  state.messages = [];
  renderMessages();
  if (validateFile(file)) {
    els.startBtn.disabled = false;
    addMessage('warn', `選択中: ${file.name}`);
  }
};

els.fileInput.addEventListener('change', (e) => onFileSelected(e.target.files?.[0]));
els.dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  els.dropzone.classList.add('drag-over');
});
els.dropzone.addEventListener('dragleave', () => els.dropzone.classList.remove('drag-over'));
els.dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  els.dropzone.classList.remove('drag-over');
  onFileSelected(e.dataTransfer?.files?.[0]);
});
els.startBtn.addEventListener('click', processPdf);
els.reprocessBtn.addEventListener('click', processPdf);

els.restoreBtn.addEventListener('click', () => {
  const restored = restoreSession();
  if (!restored) {
    addMessage('warn', '復元可能なセッションがありません。');
    return;
  }
  state.settings = restored.settings;
  state.session = restored.session;
  state.mode = restored.settings.tab ?? 'translated';
  state.page = 1;
  renderPageList();
  switchTab(state.mode);
  els.downloadBtn.disabled = false;
  els.reprocessBtn.disabled = false;
  addMessage('warn', '前回セッションを復元しました。PDF本体が必要な場合は再アップロードしてください。');
});

els.resetBtn.addEventListener('click', () => {
  resetSessionStorage();
  state.file = null;
  state.session = null;
  state.messages = [];
  state.page = 1;
  els.fileInput.value = '';
  els.startBtn.disabled = true;
  els.downloadBtn.disabled = true;
  els.reprocessBtn.disabled = true;
  els.pageList.innerHTML = '';
  els.preview.innerHTML = '';
  setStatus(STATUS.IDLE, 0, 'セッションをリセットしました');
  renderMessages();
});

els.tabSource.addEventListener('click', () => switchTab('source'));
els.tabTranslated.addEventListener('click', () => switchTab('translated'));

els.downloadBtn.addEventListener('click', async () => {
  if (!state.session) return;
  try {
    const { url, fileName } = await buildTranslatedPdf(state.session.meta, state.session.layout.pages);
    if (state.pdfDownload) URL.revokeObjectURL(state.pdfDownload);
    state.pdfDownload = url;
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
  } catch (error) {
    addMessage('error', 'PDF生成に失敗しました。');
    console.error(error);
  }
});

setStatus(STATUS.IDLE, 0, 'PDFを選択してください');
