// ===== DATA LAYER (with Supabase sync) =====
const Store = {
  _key: 'studyplan_v1',
  _syncDebounce: null,

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
    const local = this.load();
    const remote = await this.pullFromCloud();

    if (!remote || !remote.subjects) {
      // No remote data — push local to cloud
      await this.pushToCloud(local);
      return local;
    }

    // Merge strategy: remote wins if it has more recent data
    // Simple heuristic: use whichever has more blocks/subjects
    const localItems = (local.subjects?.length || 0) + (local.blocks?.length || 0);
    const remoteItems = (remote.subjects?.length || 0) + (remote.blocks?.length || 0);

    if (remoteItems >= localItems) {
      // Remote has more data — use it and save locally
      localStorage.setItem(this._key, JSON.stringify(remote));
      return remote;
    } else {
      // Local has more data — push to cloud
      await this.pushToCloud(local);
      return local;
    }
  },

  _defaults() {
    return {
      subjects: [],
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
