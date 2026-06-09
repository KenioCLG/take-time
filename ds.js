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
 *   DS.icon(name, opts?)        — inline SVG icon string
 *   DS.el(tag, attrs, children) — DOM element factory
 *   DS.html(tag, attrs, inner)  — HTML string builder
 *   DS.escapeHtml(str)          — XSS-safe text
 */

const DS = (() => {

  /* ============================================================
     ICONS — SVG inline icon library (stroke-based, 24x24 viewBox)
     ============================================================ */

  const ICON_PATHS = {
    plus: "<line x1=\"12\" y1=\"5\" x2=\"12\" y2=\"19\"/><line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"/>",
    x: "<line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"/><line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"/>",
    check: "<polyline points=\"20 6 9 17 4 12\"/>",
    chevronR: "<polyline points=\"9 18 15 12 9 6\"/>",
    chevronL: "<polyline points=\"15 18 9 12 15 6\"/>",
    chevronD: "<polyline points=\"6 9 12 15 18 9\"/>",
    clock: "<circle cx=\"12\" cy=\"12\" r=\"10\"/><polyline points=\"12 6 12 12 16 14\"/>",
    book: "<path d=\"M4 19.5A2.5 2.5 0 0 1 6.5 17H20\"/><path d=\"M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z\"/>",
    gear: "<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42\"/>",
    trash: "<polyline points=\"3 6 5 6 21 6\"/><path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"/>",
    edit: "<path d=\"M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7\"/><path d=\"M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z\"/>",
    star: "<polygon points=\"12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2\"/>",
    bell: "<path d=\"M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9\"/><path d=\"M13.73 21a2 2 0 0 1-3.46 0\"/>",
    sun: "<circle cx=\"12\" cy=\"12\" r=\"5\"/><line x1=\"12\" y1=\"1\" x2=\"12\" y2=\"3\"/><line x1=\"12\" y1=\"21\" x2=\"12\" y2=\"23\"/><line x1=\"4.22\" y1=\"4.22\" x2=\"5.64\" y2=\"5.64\"/><line x1=\"18.36\" y1=\"18.36\" x2=\"19.78\" y2=\"19.78\"/><line x1=\"1\" y1=\"12\" x2=\"3\" y2=\"12\"/><line x1=\"21\" y1=\"12\" x2=\"23\" y2=\"12\"/><line x1=\"4.22\" y1=\"19.78\" x2=\"5.64\" y2=\"18.36\"/><line x1=\"18.36\" y1=\"5.64\" x2=\"19.78\" y2=\"4.22\"/>",
    info: "<circle cx=\"12\" cy=\"12\" r=\"10\"/><line x1=\"12\" y1=\"16\" x2=\"12\" y2=\"12\"/><line x1=\"12\" y1=\"8\" x2=\"12.01\" y2=\"8\"/>",
    warning: "<path d=\"M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z\"/><line x1=\"12\" y1=\"9\" x2=\"12\" y2=\"13\"/><line x1=\"12\" y1=\"17\" x2=\"12.01\" y2=\"17\"/>",
    success: "<path d=\"M22 11.08V12a10 10 0 1 1-5.93-9.14\"/><polyline points=\"22 4 12 14.01 9 11.01\"/>",
    dumbbell: "<path d=\"M6.5 6.5h11M17.5 4v5M6.5 4v5\"/><rect x=\"3\" y=\"5\" width=\"3.5\" height=\"3\" rx=\"0.5\"/><rect x=\"17.5\" y=\"5\" width=\"3.5\" height=\"3\" rx=\"0.5\"/><path d=\"M6.5 17.5h11M17.5 15v5M6.5 15v5\"/><rect x=\"3\" y=\"16\" width=\"3.5\" height=\"3\" rx=\"0.5\"/><rect x=\"17.5\" y=\"16\" width=\"3.5\" height=\"3\" rx=\"0.5\"/>",
    dumbell: "<path d=\"M6.5 6.5h11M17.5 4v5M6.5 4v5\"/><rect x=\"3\" y=\"5\" width=\"3.5\" height=\"3\" rx=\"0.5\"/><rect x=\"17.5\" y=\"5\" width=\"3.5\" height=\"3\" rx=\"0.5\"/><path d=\"M6.5 17.5h11M17.5 15v5M6.5 15v5\"/><rect x=\"3\" y=\"16\" width=\"3.5\" height=\"3\" rx=\"0.5\"/><rect x=\"17.5\" y=\"16\" width=\"3.5\" height=\"3\" rx=\"0.5\"/>",
    'bell-ring': "<path d=\"M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9\"/><path d=\"M13.73 21a2 2 0 0 1-3.46 0\"/><line x1=\"1\" y1=\"8\" x2=\"3\" y2=\"8\"/><line x1=\"21\" y1=\"8\" x2=\"23\" y2=\"8\"/><line x1=\"2\" y1=\"2\" x2=\"4\" y2=\"4\"/><line x1=\"22\" y1=\"2\" x2=\"20\" y2=\"4\"/>",
    'book-open': "<path d=\"M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z\"/><path d=\"M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z\"/>",
    moon: "<path d=\"M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z\"/>",
    coffee: "<path d=\"M18 8h1a4 4 0 0 1 0 8h-1\"/><path d=\"M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z\"/><line x1=\"6\" y1=\"1\" x2=\"6\" y2=\"4\"/><line x1=\"10\" y1=\"1\" x2=\"10\" y2=\"4\"/><line x1=\"14\" y1=\"1\" x2=\"14\" y2=\"4\"/>",
    'calendar-check': "<rect x=\"3\" y=\"4\" width=\"18\" height=\"18\" rx=\"2\"/><line x1=\"16\" y1=\"2\" x2=\"16\" y2=\"6\"/><line x1=\"8\" y1=\"2\" x2=\"8\" y2=\"6\"/><line x1=\"3\" y1=\"10\" x2=\"21\" y2=\"10\"/><polyline points=\"9 16 11 18 15 14\"/>",
    repeat: "<polyline points=\"17 1 21 5 17 9\"/><path d=\"M3 11V9a4 4 0 0 1 4-4h14\"/><polyline points=\"7 23 3 19 7 15\"/><path d=\"M21 13v2a4 4 0 0 1-4 4H3\"/>",
    icon: "<rect width=\"512\" height=\"512\" rx=\"108\" fill=\"#007AFF\"/> <g transform=\"translate(256,256)\"> <rect x=\"-120\" y=\"-140\" width=\"240\" height=\"280\" rx=\"24\" fill=\"white\" opacity=\"0.95\"/> <rect x=\"-90\" y=\"-90\" width=\"180\" height=\"6\" rx=\"3\" fill=\"#007AFF\" opacity=\"0.3\"/> <rect x=\"-90\" y=\"-65\" width=\"120\" height=\"6\" rx=\"3\" fill=\"#007AFF\" opacity=\"0.2\"/> <rect x=\"-90\" y=\"-30\" width=\"180\" height=\"6\" rx=\"3\" fill=\"#34C759\" opacity=\"0.3\"/> <rect x=\"-90\" y=\"-5\" width=\"140\" height=\"6\" rx=\"3\" fill=\"#34C759\" opacity=\"0.2\"/> <rect x=\"-90\" y=\"30\" width=\"180\" height=\"6\" rx=\"3\" fill=\"#FF9500\" opacity=\"0.3\"/> <rect x=\"-90\" y=\"55\" width=\"100\" height=\"6\" rx=\"3\" fill=\"#FF9500\" opacity=\"0.2\"/> <circle cx=\"70\" cy=\"-87\" r=\"12\" fill=\"none\" stroke=\"#007AFF\" stroke-width=\"3\"/> <circle cx=\"70\" cy=\"-27\" r=\"12\" fill=\"#34C759\"/> <polyline points=\"63,-27 68,-22 77,-32\" fill=\"none\" stroke=\"white\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/> <circle cx=\"70\" cy=\"33\" r=\"12\" fill=\"none\" stroke=\"#FF9500\" stroke-width=\"3\"/> </g>",
  };

  function icon(name, opts = {}) {
    const size = opts.size || 24;
    const cls = opts.class || '';
    const sw = opts.strokeWidth || 2;
    const paths = ICON_PATHS[name] || '';
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" class="${cls}">${paths}</svg>`;
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
            <button class="ds-confirm-btn ds-confirm-btn--cancel" data-action="cancel">${typeof I18n !== 'undefined' ? I18n.t('confirm.cancel') : 'Cancelar'}</button>
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
        snapTo(sheetEl, 0, () => {
          overlay.classList.add('hidden');
          sheetEl.style.height = '';
          sheetEl.style.transition = '';
          unlockBody();
          activeSheet = null;
        });
      } else {
        overlay.classList.add('hidden');
        unlockBody();
        activeSheet = null;
      }
    }

    function openSheet(overlay) {
      const sheetEl = overlay.querySelector('.ds-sheet');
      if (!sheetEl) return;

      overlay.classList.remove('hidden');
      lockBody();
      activeSheet = sheetEl;
      lastTouchY = 0;
      overlay.addEventListener('touchmove', onOverlayTouchMove, { passive: false });

      // Start from 0 and animate to peek
      sheetEl.style.height = '0';
      requestAnimationFrame(() => {
        snapTo(sheetEl, SNAP_PEEK);
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
    toast,
    confirm,
    el,
    html,
    escapeHtml,
    sheet,
    ICONS: ICON_PATHS,
  };

})();
