// ===== DATA LAYER (with Supabase sync) =====
const Store = {
  _keyPrefix: 'studyplan_',
  _syncDebounce: null,

  // Key per user — isolates localStorage between accounts
  get _key() {
    const uid = window.Supabase?._user?.id;
    return uid ? this._keyPrefix + uid : this._keyPrefix + 'anonymous';
  },

  load() {
    try { return JSON.parse(localStorage.getItem(this._key)) || this._defaults(); }
    catch { return this._defaults(); }
  },

  save(data) {
    try {
      localStorage.setItem(this._key, JSON.stringify(data));
    } catch (e) {
      console.error('Store.save failed:', e);
    }
    // Debounced cloud sync
    this._scheduleSync(data);
  },

  _scheduleSync(data) {
    if (this._syncDebounce) clearTimeout(this._syncDebounce);
    this._syncDebounce = setTimeout(() => {
      this.pushToCloud(data);
    }, 2000); // Wait 2s after last save to batch changes
  },

  async pushToCloud(data) {
    if (!window.Supabase || !Supabase._user) return;
    const ok = await Supabase.saveUserData(data);
    if (ok) {
      console.log('[Sync] Pushed to cloud');
    }
  },

  async pullFromCloud() {
    if (!window.Supabase || !Supabase._user) return null;
    const remote = await Supabase.loadUserData();
    if (remote && remote.state) {
      return remote.state;
    }
    return null;
  },

  async syncOnLogin() {
    // Migrate data from old shared key if it exists and user key is empty
    const oldKey = 'studyplan_v1';
    const oldData = localStorage.getItem(oldKey);
    const userData = localStorage.getItem(this._key);
    if (oldData && !userData) {
      localStorage.setItem(this._key, oldData);
      localStorage.removeItem(oldKey);
    }

    const local = this.load();
    const remote = await this.pullFromCloud();

    if (!remote || !remote.subjects) {
      // No remote data — push local to cloud
      await this.pushToCloud(local);
      return local;
    }

    // Preserva propriedades exclusivas locais que ainda não estão no remote (ex: nova feature)
    if (!remote.priorities && local.priorities) {
      remote.priorities = local.priorities;
    }

    // Remote always wins — it's the source of truth per user
    localStorage.setItem(this._key, JSON.stringify(remote));
    return remote;
  },

  _defaults() {
    return {
      subjects: [],
      blocks: [],
      logs: [],
      settings: { notifications: false, reminderMin: 10, theme: 'auto', showMarquee: true },
      priorities: {
        zone1: [],
        zone2: [],
        zone3: [],
        unallocated: [
          { id: 'p1', name: 'Saúde e disposição', pillar: 'pessoal', color: '#34c759' },
          { id: 'p2', name: 'Desenvolvimento pessoal', pillar: 'pessoal', color: '#34c759' },
          { id: 'p3', name: 'Equilíbrio emocional', pillar: 'pessoal', color: '#34c759' },
          { id: 'pr1', name: 'Finanças', pillar: 'profissional', color: '#ff9500' },
          { id: 'pr2', name: 'Carreira e propósito', pillar: 'profissional', color: '#ff9500' },
          { id: 'pr3', name: 'Impacto social', pillar: 'profissional', color: '#ff9500' },
          { id: 'r1', name: 'Família', pillar: 'relacionamentos', color: '#ff2d55' },
          { id: 'r2', name: 'Relacionamentos amorosos', pillar: 'relacionamentos', color: '#ff2d55' },
          { id: 'r3', name: 'Amizades e social', pillar: 'relacionamentos', color: '#ff2d55' },
          { id: 'q1', name: 'Hobbies / Lazer', pillar: 'qualidade', color: '#5ac8fa' },
          { id: 'q2', name: 'Espiritualidade', pillar: 'qualidade', color: '#5ac8fa' },
          { id: 'q3', name: 'Plenitude / Felicidade', pillar: 'qualidade', color: '#5ac8fa' }
        ]
      }
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
