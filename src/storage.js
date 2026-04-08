import { STORAGE_KEYS } from './constants.js';

const safeSet = (key, value, messages) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    messages.push({ type: 'error', text: 'LocalStorage 書き込みに失敗しました。' });
    console.error(error);
  }
};

export const saveSession = (session, settings, messages) => {
  safeSet(STORAGE_KEYS.settings, settings, messages);
  safeSet(STORAGE_KEYS.meta, session.meta, messages);
  safeSet(STORAGE_KEYS.extracted, session.extracted, messages);
  safeSet(STORAGE_KEYS.translated, session.translated, messages);
  safeSet(STORAGE_KEYS.layout, session.layout, messages);
};

const safeGet = (key) => {
  const text = localStorage.getItem(key);
  return text ? JSON.parse(text) : null;
};

export const restoreSession = () => {
  const settings = safeGet(STORAGE_KEYS.settings) ?? { tab: 'translated', zoom: 1 };
  const meta = safeGet(STORAGE_KEYS.meta);
  const extracted = safeGet(STORAGE_KEYS.extracted);
  const translated = safeGet(STORAGE_KEYS.translated);
  const layout = safeGet(STORAGE_KEYS.layout);

  if (!meta || !extracted || !translated || !layout) {
    return null;
  }

  return {
    settings,
    session: { meta, extracted, translated, layout },
  };
};

export const resetSessionStorage = () => {
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
};
