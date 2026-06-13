import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const SUPABASE_URL = 'https://zkzhqgbhxhkwpgevddot.supabase.co';
const SUPABASE_KEY = 'sb_publishable_fiIs6h7zRNlZgi4y-vTY2w_t2iZLY2R';
const CONFIG_DIR = join(homedir(), '.taketime');
const TOKEN_FILE = join(CONFIG_DIR, 'refresh-token');
const SESSION_FILE = join(CONFIG_DIR, 'session.json');

function ensureConfigDir() {
  mkdirSync(CONFIG_DIR, { recursive: true });
}

export function persistSession(session) {
  ensureConfigDir();
  writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), 'utf8');
  if (session.refresh_token) {
    writeFileSync(TOKEN_FILE, session.refresh_token, 'utf8');
  }
}

export function loadSession() {
  try {
    return JSON.parse(readFileSync(SESSION_FILE, 'utf8'));
  } catch {
    // Fallback: try refresh token only
    try {
      const rt = readFileSync(TOKEN_FILE, 'utf8').trim();
      return rt ? { refresh_token: rt } : null;
    } catch {
      return null;
    }
  }
}

export function clearSession() {
  try { writeFileSync(SESSION_FILE, '', 'utf8'); } catch {}
  try { writeFileSync(TOKEN_FILE, '', 'utf8'); } catch {}
}

export class SupabaseClient {
  constructor() {
    this.accessToken = null;
    this.refreshToken = null;
    this.userId = null;
    this.userEmail = null;
  }

  _headers() {
    return {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  async _fetch(path, opts = {}) {
    const url = `${SUPABASE_URL}${path}`;
    const headers = opts.skipAuth
      ? { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json', ...opts.headers }
      : { ...this._headers(), ...opts.headers };

    const res = await fetch(url, { ...opts, headers });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.message || data?.msg || data?.error_description || `HTTP ${res.status}`);
    return data;
  }

  async loginWithCredentials(email, password) {
    const data = await this._fetch('/auth/v1/token?grant_type=password', {
      method: 'POST',
      skipAuth: true,
      body: JSON.stringify({ email, password }),
    });
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    this.userId = data.user?.id;
    this.userEmail = data.user?.email;
    persistSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user_id: data.user?.id,
      user_email: data.user?.email,
      expires_at: Date.now() + (data.expires_in || 3600) * 1000,
    });
    return data.user;
  }

  async loginWithRefreshToken(token) {
    const data = await this._fetch('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      skipAuth: true,
      body: JSON.stringify({ refresh_token: token }),
    });
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    this.userId = data.user?.id;
    this.userEmail = data.user?.email;
    persistSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user_id: data.user?.id,
      user_email: data.user?.email,
      expires_at: Date.now() + (data.expires_in || 3600) * 1000,
    });
    return data.user;
  }

  async restoreSession() {
    const session = loadSession();
    if (!session) return false;

    // Try refresh token first (always fresh)
    if (session.refresh_token) {
      try {
        await this.loginWithRefreshToken(session.refresh_token);
        return true;
      } catch {
        // Token expired or invalid
      }
    }

    // Try access token if not expired
    if (session.access_token && session.expires_at > Date.now()) {
      this.accessToken = session.access_token;
      this.userId = session.user_id;
      this.userEmail = session.user_email;
      return true;
    }

    return false;
  }

  async query(table, filters = {}, extra = '') {
    const userField = table === 'profiles' ? 'id' : 'user_id';
    let params = [`${userField}=eq.${this.userId}`];
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined && v !== null) {
        params.push(`${k}=eq.${encodeURIComponent(v)}`);
      }
    }
    return this._fetch(`/rest/v1/${table}?${params.join('&')}${extra}`, {
      headers: { 'Accept': 'application/json' },
    });
  }

  async insert(table, data) {
    const userField = table === 'profiles' ? 'id' : 'user_id';
    const body = Array.isArray(data)
      ? data.map(d => ({ ...d, [userField]: this.userId }))
      : { ...data, [userField]: this.userId };
    return this._fetch(`/rest/v1/${table}`, {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify(body),
    });
  }

  async update(table, id, data) {
    const userField = table === 'profiles' ? 'id' : 'user_id';
    return this._fetch(`/rest/v1/${table}?id=eq.${id}&${userField}=eq.${this.userId}`, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify(data),
    });
  }

  async remove(table, id) {
    const userField = table === 'profiles' ? 'id' : 'user_id';
    return this._fetch(`/rest/v1/${table}?id=eq.${id}&${userField}=eq.${this.userId}`, {
      method: 'DELETE',
    });
  }
}
