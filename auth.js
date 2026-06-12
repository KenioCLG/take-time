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
    if (!res.ok) throw new Error(data?.error_description || data?.msg || data?.message || `HTTP ${res.status}`);
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
};

// ===== AUTH SERVICE (wraps Supabase) =====
const AuthError = {
  EMPTY_FIELDS: 'EMPTY_FIELDS',
  INVALID_EMAIL: 'INVALID_EMAIL',
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
