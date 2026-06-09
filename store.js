// ===== DATA LAYER =====
const Store = {
  _key: 'studyplan_v1',
  load() {
    try { return JSON.parse(localStorage.getItem(this._key)) || this._defaults(); }
    catch { return this._defaults(); }
  },
  save(data) {
    try {
      localStorage.setItem(this._key, JSON.stringify(data));
    } catch (e) {
      console.error('Store.save failed:', e);
      DS.toast('Erro ao salvar dados. Verifique o espaço disponível.', 'error');
    }
  },
  _defaults() {
    return {
      subjects: [
        // study
        { id: 's1', name: 'JavaScript', color: '#007aff', type: 'study' },
        { id: 's2', name: 'Node.js', color: '#34c759', type: 'study' },
        { id: 's3', name: 'English', color: '#ff9500', type: 'study' },
        // training
        { id: 't1', name: 'Musculação', color: '#ff2d55', type: 'training' },
        { id: 't2', name: 'Cardio', color: '#af52de', type: 'training' },
        // inactive
        { id: 'i1', name: 'Sono', color: '#636366', type: 'inactive' },
        { id: 'i2', name: 'Descanso', color: '#8e8e93', type: 'inactive' },
      ],
      blocks: [],
      logs: [],
      settings: { notifications: false, reminderMin: 10, theme: 'auto' },
    };
  },
};

// ===== TYPE CONFIG =====
const TYPES = {
  study:    { i18nKey: 'type.study',    icon: 'book-open' },
  training: { i18nKey: 'type.training', icon: 'dumbbell' },
  inactive: { i18nKey: 'type.inactive', icon: 'moon' },
};

// ===== I18N HELPER =====
const __ = (key, params = null, fallback = '') =>
  window.I18n ? (window.I18n.t(key, params) || fallback) : fallback;

// ===== CONSTANTS =====
const MINUTES_IN_DAY = 1440;
const MAX_LOG_SIZE = 50;
const MAX_SUBJECT_NAME_LENGTH = 40;

// ===== UTILS =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// Export to global scope for other scripts
window.Store = Store;
window.TYPES = TYPES;
window.__ = __;
window.$ = $;
window.$$ = $$;
window.uid = uid;
