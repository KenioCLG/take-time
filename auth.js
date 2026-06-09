const AuthService = {
  _key: 'studyplan_session',
  _callbacks: [],

  _notify(isAuthenticated) {
    this._callbacks.forEach(cb => cb(isAuthenticated));
  },

  async login(email, password) {
    if (!email || !password) return { success: false, error: 'EMPTY_FIELDS' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, error: 'INVALID_EMAIL' };
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));

    const user = { email, loggedAt: new Date().toISOString() };
    localStorage.setItem(this._key, JSON.stringify(user));
    this._notify(true);
    return { success: true, user };
  },

  async signup(email, password, passwordRepeat) {
    if (!email || !password || !passwordRepeat) return { success: false, error: 'EMPTY_FIELDS' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, error: 'INVALID_EMAIL' };
    if (password !== passwordRepeat) return { success: false, error: 'PASSWORD_MISMATCH' };

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));

    const user = { email, loggedAt: new Date().toISOString() };
    localStorage.setItem(this._key, JSON.stringify(user));
    this._notify(true);
    return { success: true, user };
  },

  logout() {
    localStorage.removeItem(this._key);
    this._notify(false);
  },

  isAuthenticated() {
    return this.getSessionUser() !== null;
  },

  getSessionUser() {
    try {
      const data = localStorage.getItem(this._key);
      if (data) {
        const parsed = JSON.parse(data);
        if (parsed && parsed.email) return parsed;
      }
    } catch(e) {}
    return null;
  },

  onAuthStateChange(callback) {
    this._callbacks.push(callback);
    callback(this.isAuthenticated());
    return () => {
      this._callbacks = this._callbacks.filter(cb => cb !== callback);
    };
  }
};

window.AuthService = AuthService;
