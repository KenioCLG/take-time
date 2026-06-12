// Minimal Supabase client for MCP Server — reads/writes user_data JSON blob

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const SUPABASE_URL = 'https://gwujukwvufmfecqgzvrs.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Ewz6w7rlPFbfJy9DQMiuRA_58FSrWJZ';
const TOKEN_FILE = join(homedir(), '.taketime', 'refresh-token');

function persistRefreshToken(token) {
  try {
    mkdirSync(join(homedir(), '.taketime'), { recursive: true });
    writeFileSync(TOKEN_FILE, token, 'utf8');
  } catch (e) {
    console.error('[MCP] Could not persist refresh token:', e.message);
  }
}

export function loadPersistedRefreshToken() {
  try {
    return readFileSync(TOKEN_FILE, 'utf8').trim();
  } catch {
    return null;
  }
}

export class SupabaseClient {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.refreshToken = null;
    this.userId = null;
    this._refreshTimer = null;
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

  async authenticate() {
    const user = await this._fetch('/auth/v1/user');
    if (!user || !user.id) throw new Error('Invalid access token');
    this.userId = user.id;

    // Try to extract expiry from JWT and schedule refresh
    this._scheduleRefreshFromJwt(this.accessToken);

    return user;
  }

  // Login with email/password to get a proper session with refresh token
  async loginWithCredentials(email, password) {
    const data = await this._fetch('/auth/v1/token?grant_type=password', {
      method: 'POST',
      skipAuth: true,
      body: JSON.stringify({ email, password }),
    });
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    this.userId = data.user?.id;
    if (data.expires_in) {
      this._scheduleRefresh(data.expires_in);
    }
    return data.user;
  }

  // Login using only a refresh token — no password needed
  async loginWithRefreshToken(token) {
    const data = await this._fetch('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      skipAuth: true,
      body: JSON.stringify({ refresh_token: token }),
    });
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    persistRefreshToken(data.refresh_token);
    this.userId = data.user?.id;
    if (data.expires_in) {
      this._scheduleRefresh(data.expires_in);
    }
    return data.user;
  }

  async refreshSession() {
    if (!this.refreshToken) {
      console.error('[MCP] No refresh token — session will expire. Use email/password auth for auto-refresh.');
      return;
    }
    try {
      const data = await this._fetch('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({ refresh_token: this.refreshToken }),
      });
      this.accessToken = data.access_token;
      this.refreshToken = data.refresh_token;
      persistRefreshToken(data.refresh_token);
      if (data.expires_in) {
        this._scheduleRefresh(data.expires_in);
      }
      console.error('[MCP] Session refreshed successfully');
    } catch (e) {
      console.error('[MCP] Session refresh failed:', e.message);
    }
  }

  _scheduleRefresh(expiresInSec) {
    if (this._refreshTimer) clearTimeout(this._refreshTimer);
    // Refresh 60s before expiry
    const ms = Math.max((expiresInSec - 60) * 1000, 30000);
    this._refreshTimer = setTimeout(() => this.refreshSession(), ms);
  }

  _scheduleRefreshFromJwt(token) {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      if (payload.exp) {
        const expiresIn = payload.exp - Math.floor(Date.now() / 1000);
        if (expiresIn > 0 && expiresIn < 7200) {
          console.error(`[MCP] Token expires in ${Math.round(expiresIn / 60)}min — no refresh token available`);
        }
      }
    } catch {}
  }

  async loadState() {
    if (!this.userId) await this.authenticate();
    const data = await this._fetch(
      `/rest/v1/user_data?id=eq.${this.userId}&select=state`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (!data || data.length === 0) return null;
    return data[0].state;
  }

  async saveState(state) {
    if (!this.userId) await this.authenticate();
    await this._fetch('/rest/v1/user_data', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({ id: this.userId, state }),
    });
  }
}
