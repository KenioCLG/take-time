// ===== SUPABASE CLIENT =====
const SUPABASE_URL = 'https://zkzhqgbhxhkwpgevddot.supabase.co';
const SUPABASE_KEY = 'sb_publishable_fiIs6h7zRNlZgi4y-vTY2w_t2iZLY2R';

// Minimal Supabase client (no SDK needed)
const Supabase = {
  _accessToken: null,
  _refreshToken: null,
  _user: null,
  _sessionKey: 'taketime_session',
  _refreshTimer: null,

  _headers(auth = true) {
    const h = {
      'apikey': SUPABASE_KEY,
      'Content-Type': 'application/json',
    };
    if (auth && this._accessToken) {
      h['Authorization'] = `Bearer ${this._accessToken}`;
    }
    return h;
  },

  async _fetch(path, opts = {}) {
    const url = `${SUPABASE_URL}${path}`;
    const res = await fetch(url, {
      ...opts,
      headers: { ...this._headers(opts.auth !== false), ...opts.headers },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      console.warn('[Auth]', res.status, path, data);
      throw new Error(data?.error_description || data?.msg || data?.message || `HTTP ${res.status}`);
    }
    return data;
  },

  _saveSession() {
    const session = {
      access_token: this._accessToken,
      refresh_token: this._refreshToken,
      user: this._user,
    };
    localStorage.setItem(this._sessionKey, JSON.stringify(session));
  },

  _clearSession() {
    this._accessToken = null;
    this._refreshToken = null;
    this._user = null;
    localStorage.removeItem(this._sessionKey);
    if (this._refreshTimer) clearTimeout(this._refreshTimer);
  },

  _setSession(data) {
    this._accessToken = data.access_token;
    this._refreshToken = data.refresh_token;
    this._user = data.user;
    this._saveSession();
    // Auto-refresh 60s before expiry
    if (data.expires_in) {
      if (this._refreshTimer) clearTimeout(this._refreshTimer);
      this._refreshTimer = setTimeout(() => this.refreshSession(), (data.expires_in - 60) * 1000);
    }
  },

  loadSession() {
    try {
      const raw = localStorage.getItem(this._sessionKey);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.access_token && s.user) {
          this._accessToken = s.access_token;
          this._refreshToken = s.refresh_token;
          this._user = s.user;
          // Refresh immediately on load to ensure token is valid
          this.refreshSession().catch(() => this._clearSession());
          return true;
        }
      }
    } catch (e) {}
    return false;
  },

  async refreshSession() {
    if (!this._refreshToken) return;
    try {
      const data = await this._fetch('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({ refresh_token: this._refreshToken }),
      });
      this._setSession(data);
    } catch (e) {
      console.warn('Session refresh failed:', e);
      this._clearSession();
    }
  },

  // --- Data operations ---
  async loadUserData() {
    if (!this._user) return null;
    try {
      const data = await this._fetch(`/rest/v1/user_data?id=eq.${this._user.id}&select=state,updated_at`, {
        headers: { 'Accept': 'application/json' },
      });
      return data && data.length > 0 ? data[0] : null;
    } catch (e) {
      console.warn('Load user data failed:', e);
      return null;
    }
  },

  async saveUserData(state) {
    if (!this._user) return false;
    try {
      await this._fetch('/rest/v1/user_data', {
        method: 'POST',
        headers: {
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          id: this._user.id,
          state: state,
        }),
      });
      return true;
    } catch (e) {
      console.warn('Save user data failed:', e);
      return false;
    }
  },

  // --- Relational Data API (Phase 2) ---

  async _restGet(table, params = '') {
    try {
      return await this._fetch(`/rest/v1/${table}?select=*${params}`, {
        headers: { 'Accept': 'application/json' },
      }) || [];
    } catch (e) {
      console.warn(`[Sync] GET ${table} failed:`, e);
      return [];
    }
  },

  async _restUpsert(table, rows) {
    if (!rows || rows.length === 0) return;
    try {
      await this._fetch(`/rest/v1/${table}`, {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(rows),
      });
    } catch (e) {
      console.warn(`[Sync] UPSERT ${table} failed:`, e);
    }
  },

  async _restDeleteOrphans(table, keepIds) {
    try {
      if (keepIds.length === 0) {
        await this._fetch(`/rest/v1/${table}?id=not.is.null`, { method: 'DELETE' });
      } else {
        await this._fetch(`/rest/v1/${table}?id=not.in.(${keepIds.join(',')})`, { method: 'DELETE' });
      }
    } catch (e) {
      console.warn(`[Sync] DELETE orphans ${table} failed:`, e);
    }
  },

  async loadRelationalData() {
    if (!this._user) return null;
    try {
      const [subjects, items, blocks, profiles, priorities, logs, notes] = await Promise.all([
        this._restGet('subjects', '&order=sort_order'),
        this._restGet('subject_items', '&order=sort_order'),
        this._restGet('blocks'),
        this._restGet('profiles', `&id=eq.${this._user.id}`),
        this._restGet('priorities', '&order=sort_order'),
        this._restGet('logs', '&order=created_at.desc&limit=50'),
        this._restGet('notes', '&order=updated_at.desc').catch(() => []),
      ]);

      const mappedSubjects = subjects.map(s => {
        const sItems = items.filter(i => i.subject_id === s.id);
        const base = { id: s.id, name: s.name, color: s.color, type: s.type, slots: s.slots || [] };
        if (s.type === 'study') {
          base.syllabus = sItems.map(i => ({ id: i.id, topic: i.name, materia: i.materia || '', status: i.done ? 'completed' : 'pending' }));
        } else if (s.type === 'training') {
          base.exercises = sItems.map(i => ({ id: i.id, name: i.name, sets: i.sets || 0, reps: i.reps || '', weight: i.weight || '' }));
        } else {
          base.checklist = sItems.map(i => ({ id: i.id, task: i.name, done: !!i.done }));
        }
        return base;
      });

      const mappedBlocks = blocks.map(b => ({
        id: b.id,
        subjectId: b.subject_id,
        date: b.date,
        start: b.start_time?.substring(0, 5),
        end: b.end_time?.substring(0, 5),
        topic: b.topic || '',
        done: !!b.done,
        repeatDaily: !!b.repeat_daily,
        completedItems: b.completed_items || [],
      }));

      const profile = profiles[0] || {};
      const mappedSettings = {
        notifications: profile.notifications ?? false,
        reminderMin: profile.reminder_min ?? 10,
        theme: profile.theme || 'auto',
        showMarquee: profile.show_marquee ?? true,
        timezone: profile.timezone || 'America/Sao_Paulo',
        language: profile.language || 'pt-BR',
      };
      if (profile.marquee_texts?.length > 0) mappedSettings.marqueeTexts = profile.marquee_texts;

      const mappedPriorities = { zone1: [], zone2: [], zone3: [], unallocated: [] };
      priorities.forEach(p => {
        if (mappedPriorities[p.zone]) mappedPriorities[p.zone].push({ id: p.id, name: p.name });
      });

      const mappedLogs = logs.map(l => ({
        id: l.id,
        timestamp: new Date(l.created_at).toLocaleString(),
        message: l.action + (l.detail ? ': ' + l.detail : ''),
      }));

      const mappedNotes = (notes || []).map(n => ({
        id: n.id,
        title: n.title || '',
        content: n.content || '',
        tags: n.tags || [],
        createdAt: n.created_at,
        updatedAt: n.updated_at,
      }));

      return { subjects: mappedSubjects, blocks: mappedBlocks, notes: mappedNotes, logs: mappedLogs, settings: mappedSettings, priorities: mappedPriorities };
    } catch (e) {
      console.warn('[Sync] loadRelationalData failed:', e);
      return null;
    }
  },

  async saveRelationalData(state) {
    if (!this._user) return false;
    const userId = this._user.id;
    try {
      // 1. Subjects
      const dbSubjects = (state.subjects || []).map((s, i) => ({
        id: s.id, user_id: userId, name: s.name, color: s.color, type: s.type, slots: s.slots || [], sort_order: i,
      }));
      await this._restUpsert('subjects', dbSubjects);
      await this._restDeleteOrphans('subjects', dbSubjects.map(s => s.id));

      // 2. Subject items
      const dbItems = [];
      (state.subjects || []).forEach(s => {
        const list = s.type === 'study' ? s.syllabus : s.type === 'training' ? s.exercises : s.checklist;
        (list || []).forEach((item, i) => {
          dbItems.push({
            id: item.id, user_id: userId, subject_id: s.id,
            name: item.topic || item.name || item.task || '',
            materia: item.materia || null,
            sets: item.sets || null, reps: item.reps ? String(item.reps) : null, weight: item.weight || null,
            done: s.type === 'study' ? item.status === 'completed' : !!item.done,
            sort_order: i,
          });
        });
      });
      await this._restUpsert('subject_items', dbItems);
      await this._restDeleteOrphans('subject_items', dbItems.map(i => i.id));

      // 3. Blocks
      const dbBlocks = (state.blocks || []).map(b => ({
        id: b.id, user_id: userId, subject_id: b.subjectId,
        date: b.date, start_time: b.start, end_time: b.end,
        topic: b.topic || '', done: !!b.done, repeat_daily: !!b.repeatDaily,
        completed_items: b.completedItems || [],
      }));
      await this._restUpsert('blocks', dbBlocks);
      await this._restDeleteOrphans('blocks', dbBlocks.map(b => b.id));

      // 4. Settings (profile)
      const st = state.settings || {};
      try {
        await this._fetch(`/rest/v1/profiles?id=eq.${userId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            notifications: st.notifications ?? false,
            reminder_min: st.reminderMin ?? 10,
            theme: st.theme || 'auto',
            show_marquee: st.showMarquee ?? true,
            timezone: st.timezone || 'America/Sao_Paulo',
            language: st.language || 'pt-BR',
            marquee_texts: st.marqueeTexts || [],
          }),
        });
      } catch (e) { console.warn('[Sync] PATCH profiles failed:', e); }

      // 5. Priorities
      const dbPriorities = [];
      ['zone1', 'zone2', 'zone3', 'unallocated'].forEach(zone => {
        (state.priorities?.[zone] || []).forEach((item, i) => {
          dbPriorities.push({ id: item.id, user_id: userId, name: item.name, zone, sort_order: i });
        });
      });
      await this._restUpsert('priorities', dbPriorities);
      await this._restDeleteOrphans('priorities', dbPriorities.map(p => p.id));

      // 6. Notes
      const dbNotes = (state.notes || []).map(n => ({
        id: n.id, user_id: userId,
        title: n.title || '', content: n.content || '',
        tags: n.tags || [],
        created_at: n.createdAt || new Date().toISOString(),
        updated_at: n.updatedAt || new Date().toISOString(),
      }));
      try {
        await this._restUpsert('notes', dbNotes);
        await this._restDeleteOrphans('notes', dbNotes.map(n => n.id));
      } catch (e) { console.warn('[Sync] Notes sync failed (table may not exist yet):', e); }

      return true;
    } catch (e) {
      console.warn('[Sync] saveRelationalData failed:', e);
      return false;
    }
  },
};

// ===== AUTH SERVICE (wraps Supabase) =====
const AuthError = {
  EMPTY_FIELDS: 'EMPTY_FIELDS',
  INVALID_EMAIL: 'INVALID_EMAIL',
  WEAK_PASSWORD: 'WEAK_PASSWORD',
  PASSWORD_MISMATCH: 'PASSWORD_MISMATCH',
};

const AuthService = {
  _callbacks: [],

  _notify(isAuthenticated) {
    this._callbacks.forEach(cb => cb(isAuthenticated));
  },

  async login(email, password) {
    if (!email || !password) return { success: false, error: AuthError.EMPTY_FIELDS };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, error: AuthError.INVALID_EMAIL };

    try {
      const data = await Supabase._fetch('/auth/v1/token?grant_type=password', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({ email, password }),
      });
      Supabase._setSession(data);
      this._notify(true);
      return { success: true, user: data.user };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  async signup(email, password, passwordRepeat) {
    if (!email || !password || !passwordRepeat) return { success: false, error: AuthError.EMPTY_FIELDS };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, error: AuthError.INVALID_EMAIL };
    if (password.length < 6) return { success: false, error: AuthError.WEAK_PASSWORD };
    if (password !== passwordRepeat) return { success: false, error: AuthError.PASSWORD_MISMATCH };

    try {
      const data = await Supabase._fetch('/auth/v1/signup', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({ email, password }),
      });
      // If auto-confirm is off, user won't have access_token yet
      if (data.access_token) {
        Supabase._setSession(data);
        this._notify(true);
      }
      return { success: true, user: data.user || data };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  logout() {
    // Try to sign out on server (best-effort)
    Supabase._fetch('/auth/v1/logout', { method: 'POST' }).catch(() => {});
    Supabase._clearSession();
    this._notify(false);
  },

  isAuthenticated() {
    return Supabase._user !== null && Supabase._accessToken !== null;
  },

  getSessionUser() {
    return Supabase._user || null;
  },

  onAuthStateChange(callback) {
    this._callbacks.push(callback);
    callback(this.isAuthenticated());
    return () => {
      this._callbacks = this._callbacks.filter(cb => cb !== callback);
    };
  }
};

window.Supabase = Supabase;
window.AuthService = AuthService;
window.AuthError = AuthError;
