const I18n = (() => {
  const STORAGE_KEY = 'studyplan_locale';
  const DEFAULT = 'pt-BR';
  const SUPPORTED = ['pt-BR', 'en-US'];

  let locale = DEFAULT;
  let translations = {};
  let fallbackTranslations = {};
  let listeners = [];

  function detect() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED.includes(saved)) return saved;
    const lang = (navigator.language || '').substring(0, 2);
    if (lang === 'en') return 'en-US';
    return DEFAULT;
  }

  async function init() {
    locale = detect();
    await load(locale);
    applyStatic();
    return locale;
  }

  async function load(localeCode) {
    try {
      const resp = await fetch(`locales/${localeCode}.json?t=${Date.now()}`);
      translations = await resp.json();
    } catch { translations = {}; }
    if (localeCode !== DEFAULT) {
      try {
        const resp = await fetch(`locales/${DEFAULT}.json?t=${Date.now()}`);
        fallbackTranslations = await resp.json();
      } catch { fallbackTranslations = {}; }
    } else {
      fallbackTranslations = {};
    }
  }

  function t(key, opts = {}) {
    let val = translations[key] || fallbackTranslations[key] || null;
    if (val === null) return key;

    if (typeof val === 'object' && 'count' in opts) {
      const c = opts.count;
      if (c === 0 && val.zero) val = val.zero;
      else if (c === 1 && val.one) val = val.one;
      else val = val.other || '';
    }

    if (typeof val === 'string') {
      val = val.replace(/%\{(\w+)\}/g, (_, k) => (opts[k] != null ? opts[k] : `%{${k}}`));
    }
    return val;
  }

  function applyStatic() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const val = t(el.dataset.i18n);
      // Check for direct child elements (SVG, span, etc.)
      const hasChildElements = Array.from(el.childNodes).some(n => n.nodeType === 1);
      if (hasChildElements) {
        // Find the first non-whitespace text node and replace its content
        const childNodes = el.childNodes;
        for (let i = 0; i < childNodes.length; i++) {
          if (childNodes[i].nodeType === 3 && childNodes[i].textContent.trim()) {
            childNodes[i].textContent = val;
            return;
          }
        }
        // All text nodes are whitespace — prepend a new text node
        el.insertBefore(document.createTextNode(val), el.firstChild);
      } else {
        el.textContent = val;
      }
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      el.innerHTML = t(el.dataset.i18nHtml);
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
      el.setAttribute('aria-label', t(el.dataset.i18nAria));
    });
    // Update html lang attribute
    document.documentElement.lang = locale;
  }

  async function setLocale(code) {
    if (!SUPPORTED.includes(code)) return;
    locale = code;
    localStorage.setItem(STORAGE_KEY, code);
    await load(code);
    applyStatic();
    listeners.forEach(fn => fn());
  }

  function onChange(fn) { listeners.push(fn); }

  return { init, t, setLocale, onChange, applyStatic, get locale() { return locale; } };
})();
