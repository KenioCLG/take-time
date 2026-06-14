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
    }, 3000); // Wait 3s after last save to batch changes
  },

  _pushing: false,
  async pushToCloud(data) {
    if (!window.Supabase || !Supabase._user) return;
    if (this._pushing) return; // skip if already pushing
    this._pushing = true;
    try {
      const ok = await Supabase.saveRelationalData(data);
      if (ok) console.log('[Sync] Pushed to relational tables');
    } finally {
      this._pushing = false;
    }
  },

  async pullFromCloud() {
    if (!window.Supabase || !Supabase._user) return null;
    return await Supabase.loadRelationalData();
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
    if (!remote.notes && local.notes) {
      remote.notes = local.notes;
    }

    // Remote always wins — it's the source of truth per user
    localStorage.setItem(this._key, JSON.stringify(remote));
    return remote;
  },

  _defaults() {
    return {
      subjects: [],
      blocks: [],
      notes: [],
      logs: [],
      settings: { notifications: false, reminderMin: 10, theme: 'auto', showMarquee: true },
      priorities: {
        zone1: [],
        zone2: [],
        zone3: [],
        unallocated: []
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
const uid = () => crypto.randomUUID();

// Export to global scope for other scripts
window.Store = Store;
window.TYPES = TYPES;
window.__ = __;
window.$ = $;
window.$$ = $$;
window.uid = uid;
