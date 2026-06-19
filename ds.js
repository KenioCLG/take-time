/*
 * StudyPlan Design System — JS Component Library v2.0
 *
 * USAGE:
 *   <script src="ds.js"></script>
 *   DS.toast('Salvo!', 'success');
 *   const ok = await DS.confirm('Apagar?', 'Dados serão removidos.');
 *   DS.icon('plus', { size: 20 });
 *
 * COMPONENTS:
 *   DS.toast(msg, type?)        — push notification toast
 *   DS.confirm(title, msg, btn?) — promise-based confirm dialog
 *   DS.icon(name, opts?)        — inline SVG icon string (static)
 *   DS.aicon(name, opts?)       — inline SVG icon string (animated)
 *   DS.el(tag, attrs, children) — DOM element factory
 *   DS.html(tag, attrs, inner)  — HTML string builder
 *   DS.escapeHtml(str)          — XSS-safe text
 */

const DS = (() => {

  /* ============================================================
     ICONS — Timekeeper family (2px round stroke, 24x24 viewBox)
     Source: Take Time Design System handoff
     ============================================================ */

  const ICON_PATHS = {
    // --- Navigation ---
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    chevronR: '<path d="M9 5l7 7-7 7"/>',
    chevronL: '<path d="M15 5l-7 7 7 7"/>',
    chevronD: '<path d="M6 9l6 6 6-6"/>',
    chevronU: '<path d="M18 15l-6-6-6 6"/>',
    chevron: '<path d="M9 5l7 7-7 7"/>',
    arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',

    // --- Time ---
    clock: '<circle cx="12" cy="12.5" r="8.5"/><path d="M12 12.5V7.5"/><path d="M12 12.5l3.4 1.6" opacity="0.85"/>',
    hourglass: '<path d="M6 3h12"/><path d="M6 21h12"/><path d="M7 3c0 4 4 5.5 5 9 1-3.5 5-5 5-9"/><path d="M7 21c0-4 4-5.5 5-9 1 3.5 5 5 5 9"/>',
    timer: '<path d="M9 2h6"/><path d="M12 4v3.5"/><circle cx="12" cy="14" r="8"/><path d="M12 14l3-2"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M3 9h18"/><path d="M8 2.5v4M16 2.5v4"/>',
    'calendar-check': '<rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M3 9h18"/><path d="M8 2.5v4M16 2.5v4"/><path d="M9 15l2 2 4-4"/>',

    // --- Content ---
    book: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H6a2 2 0 0 0-2 2z"/><path d="M4 18.5A2 2 0 0 1 6 21h13"/>',
    'book-open': '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    notes: '<path d="M15 2.5H7a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6.5z"/><path d="M14.5 2.5V7H19"/><path d="M8.5 12.5h7M8.5 16.5h5"/>',
    pencil: '<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    edit: '<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',

    // --- Actions ---
    trash: '<path d="M4 6.5h16M9 6.5V4.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4.5v2M6.5 6.5 7.5 20a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l1-13.5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3"/>',
    repeat: '<path d="M4 8a4 4 0 0 1 4-4h9l-2.5-2.5M20 16a4 4 0 0 1-4 4H7l2.5 2.5"/><path d="M17 4l2.5 2.5L17 9M7 20l-2.5-2.5L7 15"/>',
    play: '<path d="M7 4.5v15l13-7.5z"/>',
    pause: '<path d="M8 4.5v15M16 4.5v15"/>',

    // --- Status ---
    checkCircle: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
    success: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    warning: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',

    // --- Atomic / Wellness ---
    sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z"/>',
    flame: '<path d="M12 3c1.5 3 5 4.5 5 9a5 5 0 0 1-10 0c0-2 1-3 1.5-4 .8 1 1.5 1.3 2.5 1.5C11.5 7 11 5 12 3z"/>',
    bolt: '<path d="M13.5 2.5 4.5 13.5h6L9.5 21.5l9-11h-6z"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="0.6" fill="currentColor"/>',
    coffee: '<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10.5h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 2.5c-.6 1 .6 1.8 0 3M12 2.5c-.6 1 .6 1.8 0 3" opacity="0.85"/>',
    battery: '<rect x="2" y="7" width="16" height="10" rx="2"/><path d="M22 11v2"/><path d="M7 11v2M11 11v2M15 11v2"/>',
    plug: '<path d="M12 2v6M8 2v6M16 2v6"/><path d="M5 8h14v4a7 7 0 0 1-14 0V8z"/><path d="M12 16v5"/>',

    // --- People & Objects ---
    bell: '<path d="M18 8.5a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14.5 18 8.5z"/><path d="M10.5 19.5a2 2 0 0 0 3 0"/>',
    'bell-ring': '<path d="M18 8.5a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14.5 18 8.5z"/><path d="M10.5 19.5a2 2 0 0 0 3 0"/><path d="M2 8h2M20 8h2M3 3l2 2M21 3l-2 2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
    dumbbell: '<path d="M6.5 5v14M17.5 5v14"/><path d="M3.5 8v8M20.5 8v8"/><path d="M6.5 12h11"/>',
    trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 5H4.5a2.5 2.5 0 0 0 2.5 4M17 5h2.5a2.5 2.5 0 0 1-2.5 4"/><path d="M12 14v3M9 21h6M10 21l.5-4h3l.5 4"/>',
    chart: '<path d="M4 4v16h16"/><path d="M8 14v3M12.5 10v7M17 6v11"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',

    // --- App icon (512x512 viewBox) ---
    icon: '<rect width="512" height="512" rx="108" fill="#007AFF"/> <g transform="translate(256,256)"> <rect x="-120" y="-140" width="240" height="280" rx="24" fill="white" opacity="0.95"/> <rect x="-90" y="-90" width="180" height="6" rx="3" fill="#007AFF" opacity="0.3"/> <rect x="-90" y="-65" width="120" height="6" rx="3" fill="#007AFF" opacity="0.2"/> <rect x="-90" y="-30" width="180" height="6" rx="3" fill="#34C759" opacity="0.3"/> <rect x="-90" y="-5" width="140" height="6" rx="3" fill="#34C759" opacity="0.2"/> <rect x="-90" y="30" width="180" height="6" rx="3" fill="#FF9500" opacity="0.3"/> <rect x="-90" y="55" width="100" height="6" rx="3" fill="#FF9500" opacity="0.2"/> <circle cx="70" cy="-87" r="12" fill="none" stroke="#007AFF" stroke-width="3"/> <circle cx="70" cy="-27" r="12" fill="#34C759"/> <polyline points="63,-27 68,-22 77,-32" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/> <circle cx="70" cy="33" r="12" fill="none" stroke="#FF9500" stroke-width="3"/> </g>',
  };

  /* ============================================================
     ANIMATED ICONS — SF Symbols-style motion (rotate/pulse/draw/wiggle)
     Animation plays when parent has .active or svg has data-play="1"
     ============================================================ */

  const ANIM_PATHS = {
    clock: '<circle cx="12" cy="12.5" r="8.5"/><path class="ai-h" d="M12 12.5V7.8"/><path class="ai-m" d="M12 12.5l3.2 1.5" opacity="0.85"/><circle cx="12" cy="12.5" r="0.9" fill="currentColor" stroke="none"/>',
    timer: '<path d="M9 2.5h6"/><path d="M12 4.5v3"/><circle cx="12" cy="14" r="8"/><path class="ai-sweep" d="M12 14V9.2"/>',
    bell: '<g class="ai-bell"><path d="M18 8.5a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14.5 18 8.5z"/></g><path d="M10.3 19.5a2 2 0 0 0 3.4 0"/>',
    flame: '<path class="ai-flame" d="M12 3c1.6 3 5 4.5 5 9a5 5 0 0 1-10 0c0-2 1-3 1.6-4 .8 1 1.5 1.3 2.4 1.5C11.5 7 11 5 12 3z"/>',
    atom: '<circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><g class="ai-o1"><ellipse cx="12" cy="12" rx="9" ry="3.4"/><circle cx="21" cy="12" r="1.2" fill="currentColor" stroke="none"/></g><g class="ai-o2"><ellipse cx="12" cy="12" rx="9" ry="3.4"/><circle cx="3" cy="12" r="1.2" fill="currentColor" stroke="none"/></g>',
    notes: '<path d="M15 2.5H7a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6.5z"/><path d="M14.5 2.5V7H19"/><path class="ai-line" d="M8.5 12.5h7"/><path class="ai-line ai-line2" d="M8.5 16.5h5"/>',
    checkCircle: '<circle cx="12" cy="12" r="8.5"/><path class="ai-check" d="M8.3 12.3l2.5 2.5 4.8-5.2"/>',
    settings: '<g class="ai-spin"><path d="M12 2.2l1.4 2.1 2.5-.5.3 2.5 2.3 1-.8 2.4 1.7 1.8-1.7 1.8.8 2.4-2.3 1-.3 2.5-2.5-.5L12 21.8l-1.4-2.1-2.5.5-.3-2.5-2.3-1 .8-2.4L4.6 12l1.7-1.8-.8-2.4 2.3-1 .3-2.5 2.5.5z"/></g><circle cx="12" cy="12" r="3"/>',
    hourglass: '<path d="M6 2.5h12M6 21.5h12"/><g class="ai-flip"><path d="M7 2.5c0 4 4 5.5 5 9 1-3.5 5-5 5-9"/><path d="M7 21.5c0-4 4-5.5 5-9 1 3.5 5 5 5 9"/></g>',
    target: '<circle class="ai-ring" cx="12" cy="12" r="8.5" opacity="0.9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="0.8" fill="currentColor" stroke="none"/>',
    bolt: '<path class="ai-bolt" d="M13.5 2.5 4.5 13.5h6L9.5 21.5l9-11h-6z"/>',
    book: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H6a2 2 0 0 0-2 2z"/><path d="M12 3.4v14.4" opacity="0.4"/><path class="ai-page" d="M12.4 4.3H18a.6.6 0 0 1 .6.6v10.8a.6.6 0 0 1-.6.6h-5.6" opacity="0.9"/>',
    repeat: '<g class="ai-spin"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></g>',
    plus: '<path class="ai-bob" d="M12 5v14M5 12h14"/>',
    sun: '<circle cx="12" cy="12" r="4.5"/><g class="ai-spin-slow"><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></g>',
    moon: '<path class="ai-bob" d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z"/>',
  };

  function icon(name, opts = {}) {
    const size = opts.size || 24;
    const cls = opts.class || '';
    const sw = opts.strokeWidth || 2;
    const paths = ICON_PATHS[name] || '';
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" class="${cls}">${paths}</svg>`;
  }

  function aicon(name, opts = {}) {
    const size = opts.size || 24;
    const cls = opts.class || '';
    const sw = opts.strokeWidth || 2;
    const trigger = opts.trigger || 'play';
    const play = opts.play ? '1' : '0';
    const paths = ANIM_PATHS[name] || ICON_PATHS[name] || '';
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" class="tt-aicon tt-aicon--${name} ${cls}" data-trigger="${trigger}" data-play="${play}">${paths}</svg>`;
  }


  /* ============================================================
     TOAST — push notification
     ============================================================ */

  let toastContainer = null;

  function ensureToastContainer() {
    if (toastContainer && document.body.contains(toastContainer)) return;
    toastContainer = document.createElement('div');
    toastContainer.className = 'ds-toast-container';
    document.body.appendChild(toastContainer);
  }

  function toast(message, type = 'info', duration = 3000) {
    ensureToastContainer();

    const iconName = { success: 'success', error: 'warning', warning: 'warning', info: 'info' }[type] || 'info';
    const toastEl = document.createElement('div');
    toastEl.className = `ds-toast ds-toast--${type}`;
    toastEl.innerHTML = `
      <span class="ds-toast-icon">${icon(iconName, { size: 20 })}</span>
      <span class="ds-toast-text">${escapeHtml(message)}</span>
    `;

    toastContainer.appendChild(toastEl);

    setTimeout(() => {
      toastEl.classList.add('ds-toast-exit');
      toastEl.addEventListener('animationend', () => toastEl.remove());
    }, duration);

    return toastEl;
  }


  /* ============================================================
     CONFIRM — promise-based dialog
     ============================================================ */

  function confirm(title, message, btnLabel, opts) {
    if (!btnLabel) btnLabel = typeof I18n !== 'undefined' ? I18n.t('confirm.delete') : 'Delete';
    const style = (opts && opts.style) || 'danger';
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'ds-overlay ds-overlay--center';
      overlay.innerHTML = `
        <div class="ds-confirm">
          <div class="ds-confirm-body">
            <h3 class="ds-confirm-title">${escapeHtml(title)}</h3>
            <p class="ds-confirm-message">${escapeHtml(message)}</p>
          </div>
          <div class="ds-confirm-actions">
            <button class="ds-confirm-btn ds-confirm-btn--cancel" data-action="cancel">${typeof I18n !== 'undefined' ? I18n.t('confirm.cancel') : 'Cancel'}</button>
            <button class="ds-confirm-btn ds-confirm-btn--${style}" data-action="ok">${escapeHtml(btnLabel)}</button>
          </div>
        </div>
      `;

      const close = (result) => {
        overlay.style.animation = 'ds-fadeOut 0.15s ease forwards';
        overlay.addEventListener('animationend', () => overlay.remove());
        resolve(result);
      };

      overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => close(false));
      overlay.querySelector('[data-action="ok"]').addEventListener('click', () => close(true));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });

      document.body.appendChild(overlay);
    });
  }


  /* ============================================================
     DOM HELPERS
     ============================================================ */

  function el(tag, attrs = {}, children = []) {
    const element = document.createElement(tag);

    for (const [key, val] of Object.entries(attrs)) {
      if (key === 'class') element.className = val;
      else if (key === 'style' && typeof val === 'object') Object.assign(element.style, val);
      else if (key.startsWith('on')) element.addEventListener(key.slice(2).toLowerCase(), val);
      else if (key === 'html') element.innerHTML = val;
      else if (key === 'text') element.textContent = val;
      else element.setAttribute(key, val);
    }

    if (typeof children === 'string') element.textContent = children;
    else if (Array.isArray(children)) children.forEach(c => {
      if (typeof c === 'string') element.appendChild(document.createTextNode(c));
      else if (c instanceof Node) element.appendChild(c);
    });

    return element;
  }

  function html(tag, attrs = {}, inner = '') {
    const safeKey = /^[a-zA-Z][a-zA-Z0-9\-_]*$/;
    const attrStr = Object.entries(attrs)
      .filter(([k]) => safeKey.test(k))
      .map(([k, v]) => `${k}="${escapeHtml(String(v))}"`)
      .join(' ');
    return `<${tag}${attrStr ? ' ' + attrStr : ''}>${inner}</${tag}>`;
  }


  /* ============================================================
     SECURITY
     ============================================================ */

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }


  /* ============================================================
     BOTTOM SHEET — drag handle, snap points, scroll lock
     ============================================================

     Usage:
       DS.sheet.init()  — auto-binds all .ds-sheet-handle-area / .ds-sheet-handle elements
       Sheets snap to: peek (50%), full (92%), or dismiss (close)
       Body scroll is locked when sheet is open.
       Swipe down on handle or overlay backdrop to dismiss.
     ============================================================ */

  const sheet = (() => {
    const SNAP_FULL = 0.92;  // 92% of viewport
    const SNAP_PEEK = 0.50;  // 50% of viewport
    const DISMISS_THRESHOLD = 0.25; // below 25% → close
    const VELOCITY_DISMISS = 800;   // px/s downward → close

    let activeSheet = null;
    let startY = 0;
    let startHeight = 0;
    let currentHeight = 0;
    let lastY = 0;
    let lastTime = 0;
    let velocityY = 0;
    let bodyScrollY = 0;

    function onOverlayTouchMove(e) {
      const sheetBody = e.target.closest('.ds-sheet-body');
      if (!sheetBody) {
        e.preventDefault();
        return;
      }
      // Allow scroll inside sheet body, but contain it
      const atTop = sheetBody.scrollTop <= 0;
      const atBottom = sheetBody.scrollTop + sheetBody.clientHeight >= sheetBody.scrollHeight - 1;
      const isScrollingUp = e.touches[0].clientY > (lastTouchY || 0);
      lastTouchY = e.touches[0].clientY;

      if ((atTop && isScrollingUp) || (atBottom && !isScrollingUp)) {
        e.preventDefault();
      }
    }

    let lastTouchY = 0;

    function lockBody() {
      bodyScrollY = window.scrollY;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${bodyScrollY}px`;
      document.body.style.width = '100%';
    }

    function unlockBody() {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, bodyScrollY);
    }

    function setSheetHeight(sheetEl, pct) {
      const h = Math.max(0, Math.min(SNAP_FULL, pct));
      sheetEl.style.height = `${h * 100}dvh`;
      sheetEl.style.transition = 'none';
      currentHeight = h;
    }

    function snapTo(sheetEl, pct, then) {
      sheetEl.style.transition = 'height 0.35s cubic-bezier(0.32, 0.72, 0, 1)';
      sheetEl.style.height = `${pct * 100}dvh`;
      currentHeight = pct;
      if (then) sheetEl.addEventListener('transitionend', then, { once: true });
    }

    function closeSheet(overlay) {
      const sheetEl = overlay.querySelector('.ds-sheet');
      overlay.removeEventListener('touchmove', onOverlayTouchMove);
      if (sheetEl) {
        let cleaned = false;
        const cleanup = () => {
          if (cleaned) return;
          cleaned = true;
          overlay.classList.add('hidden');
          sheetEl.style.height = '';
          sheetEl.style.transition = '';
          unlockBody();
          activeSheet = null;
        };
        snapTo(sheetEl, 0, cleanup);
        // Safety: if transitionend never fires, unlock after 400ms
        setTimeout(cleanup, 400);
      } else {
        overlay.classList.add('hidden');
        unlockBody();
        activeSheet = null;
      }
    }

    function openSheet(overlay, snapPoint) {
      const sheetEl = overlay.querySelector('.ds-sheet');
      if (!sheetEl) return;

      overlay.classList.remove('hidden');
      lockBody();
      activeSheet = sheetEl;
      lastTouchY = 0;
      overlay.addEventListener('touchmove', onOverlayTouchMove, { passive: false });

      const target = snapPoint || SNAP_PEEK;
      // Start from 0 and animate to target
      sheetEl.style.height = '0';
      requestAnimationFrame(() => {
        snapTo(sheetEl, target);
      });
    }

    function onHandleDown(e) {
      const sheetEl = e.target.closest('.ds-sheet');
      if (!sheetEl) return;

      activeSheet = sheetEl;
      const touch = e.touches ? e.touches[0] : e;
      startY = touch.clientY;
      startHeight = currentHeight || SNAP_PEEK;
      lastY = startY;
      lastTime = Date.now();
      velocityY = 0;

      sheetEl.style.transition = 'none';

      document.addEventListener('pointermove', onHandleMove, { passive: false });
      document.addEventListener('pointerup', onHandleUp);
      document.addEventListener('touchmove', onHandleTouchMove, { passive: false });
      document.addEventListener('touchend', onHandleUp);
    }

    function onHandleMove(e) {
      if (!activeSheet) return;
      e.preventDefault();
      const touch = e.touches ? e.touches[0] : e;
      const dy = startY - touch.clientY;
      const vh = window.innerHeight;
      const newH = startHeight + dy / vh;

      // Track velocity
      const now = Date.now();
      const dt = (now - lastTime) / 1000;
      if (dt > 0) velocityY = (touch.clientY - lastY) / dt;
      lastY = touch.clientY;
      lastTime = now;

      setSheetHeight(activeSheet, newH);
    }

    function onHandleTouchMove(e) {
      if (!activeSheet) return;
      e.preventDefault();
      onHandleMove(e);
    }

    function onHandleUp() {
      document.removeEventListener('pointermove', onHandleMove);
      document.removeEventListener('pointerup', onHandleUp);
      document.removeEventListener('touchmove', onHandleTouchMove);
      document.removeEventListener('touchend', onHandleUp);

      if (!activeSheet) return;

      const overlay = activeSheet.closest('.ds-overlay');

      // Fast swipe down → dismiss
      if (velocityY > VELOCITY_DISMISS) {
        if (overlay) closeSheet(overlay);
        return;
      }

      // Fast swipe up → full
      if (velocityY < -VELOCITY_DISMISS) {
        snapTo(activeSheet, SNAP_FULL);
        return;
      }

      // Snap to nearest point
      if (currentHeight < DISMISS_THRESHOLD) {
        if (overlay) closeSheet(overlay);
      } else if (currentHeight < (SNAP_PEEK + SNAP_FULL) / 2) {
        snapTo(activeSheet, SNAP_PEEK);
      } else {
        snapTo(activeSheet, SNAP_FULL);
      }
    }

    // Scroll containment: when sheet body scrolls to top, allow drag
    function onSheetBodyScroll(e) {
      const body = e.target;
      if (body.scrollTop <= 0 && activeSheet) {
        // At top of scroll — could start drag
      }
    }

    function init() {
      // Bind all handle areas (or handles directly)
      document.querySelectorAll('.ds-sheet-handle-area, .ds-sheet-handle').forEach(handle => {
        handle.addEventListener('pointerdown', onHandleDown);
        handle.addEventListener('touchstart', onHandleDown, { passive: true });
      });

      // Backdrop click to dismiss
      document.querySelectorAll('.ds-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) closeSheet(overlay);
        });
      });

      // Scroll containment on sheet bodies
      document.querySelectorAll('.ds-sheet-body').forEach(body => {
        body.addEventListener('scroll', onSheetBodyScroll, { passive: true });
      });
    }

    return { init, open: openSheet, close: closeSheet, lockBody, unlockBody };
  })();


  /* ============================================================
     PUBLIC API
     ============================================================ */

  return {
    icon,
    aicon,
    toast,
    confirm,
    el,
    html,
    escapeHtml,
    sheet,
    ICONS: ICON_PATHS,
    AICONS: ANIM_PATHS,
  };

})();
