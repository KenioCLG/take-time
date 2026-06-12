// Suppress expected SW connection error during updates
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason?.message?.includes('Receiving end does not exist')) {
    e.preventDefault();
  }
});

// ===== STATE =====
let state = Store.load();
// Fixed 24h clock: 0h-24h always
const DAY_START = 0;
const DAY_END = 24;
// Migrate: add logs and type to subjects that don't have one
if (!state.logs) state.logs = [];
if (!state.priorities) state.priorities = Store._defaults().priorities;
state.subjects.forEach(s => { if (!s.type) s.type = 'study'; });

// ====== AUTHENTICATION FLOW ======
// Guard all top-level listeners to prevent crash if element is missing
const _btnShowAuth = $('#btnShowAuthDrawer');
if (_btnShowAuth) _btnShowAuth.addEventListener('click', () => {
  DS.sheet.open($('#authDrawerOverlay'), 0.92);
  $('#authBodyLogin').classList.remove('hidden');
  $('#authBodySignup').classList.add('hidden');
  $('#authTitle').textContent = __('auth.login', null, 'Login');
});

const _btnAuthCancel = $('#authCancel');
if (_btnAuthCancel) _btnAuthCancel.addEventListener('click', () => {
  DS.sheet.close($('#authDrawerOverlay'));
});

const _linkSignup = $('#linkGoToSignup');
if (_linkSignup) _linkSignup.addEventListener('click', (e) => {
  e.preventDefault();
  $('#authBodyLogin').classList.add('hidden');
  $('#authBodySignup').classList.remove('hidden');
  $('#authTitle').textContent = __('auth.signup', null, 'Cadastro');
});

const _linkLogin = $('#linkGoToLogin');
if (_linkLogin) _linkLogin.addEventListener('click', (e) => {
  e.preventDefault();
  $('#authBodySignup').classList.add('hidden');
  $('#authBodyLogin').classList.remove('hidden');
  $('#authTitle').textContent = __('auth.login', null, 'Login');
});

function seedKenioWorkout() {
  const workoutName = 'Full Body Metabólico';
  const hasWorkout = state.subjects.find(s => s.name === workoutName);
  if (hasWorkout) return;
  
  const workout = {
    id: uid(),
    name: workoutName,
    color: '#ff2d55',
    type: 'training',
    exercises: [
      { id: uid(), name: 'Agachamento + Elevação de Gêmeos', sets: 5, reps: '40s AMRAP', weight: 'Halteres' },
      { id: uid(), name: 'Abdominal Infra (Reverse Crunch)', sets: 5, reps: '40s AMRAP', weight: 'Halteres' },
      { id: uid(), name: 'Stiff (Romanian Deadlift)', sets: 5, reps: '40s AMRAP', weight: 'Halteres' },
      { id: uid(), name: 'Remada Curvada Alternada', sets: 5, reps: '40s AMRAP', weight: 'Halteres' },
      { id: uid(), name: 'Passada Reversa + Elevação de Joelho', sets: 5, reps: '40s AMRAP', weight: 'Halteres' },
      { id: uid(), name: 'Desenvolvimento Arnold', sets: 5, reps: '40s AMRAP', weight: 'Halteres' },
      { id: uid(), name: 'Elevação Pélvica Unilateral', sets: 5, reps: '40s AMRAP', weight: 'Caneleiras' },
      { id: uid(), name: 'Remada em 4 Apoios (Bird Dog Row)', sets: 5, reps: '40s AMRAP', weight: 'Halteres' },
      { id: uid(), name: 'Thruster (Agachamento + Desenv.)', sets: 5, reps: '40s AMRAP', weight: 'Halteres' },
      { id: uid(), name: 'Dead Bug Weighted', sets: 5, reps: '40s AMRAP', weight: 'Halteres leves' }
    ]
  };
  
  state.subjects.push(workout);
  Store.save(state);
}

async function loginUser() {
  DS.sheet.close($('#authDrawerOverlay'));
  $('#authScreen').style.display = 'none';
  document.documentElement.classList.add('authenticated');
  const app = $('#app');
  app.style.display = 'block';
  app.classList.add('app-fade-in');
  app.addEventListener('animationend', () => app.classList.remove('app-fade-in'), { once: true });

  // Sync data from cloud
  try {
    const synced = await Store.syncOnLogin();
    if (synced) {
      state = synced;
      if (!state.logs) state.logs = [];
      if (!state.priorities) {
        state.priorities = Store._defaults().priorities;
      } else {
        ['zone1', 'zone2', 'zone3', 'unallocated'].forEach(k => {
          if (!state.priorities[k]) state.priorities[k] = [];
        });
      }
      state.subjects.forEach(s => { if (!s.type) s.type = 'study'; });
    }
  } catch (e) { console.warn('Sync on login failed:', e); }

  if (typeof render === 'function') render();
  if (typeof renderSubjects === 'function') renderSubjects();
  if (typeof initPriorities === 'function') initPriorities();
  if (typeof updateMarqueeVisibility === 'function') updateMarqueeVisibility();
}

function setAuthLoading(loading) {
  const btnLogin = $('#btnAuthLogin');
  const btnSignup = $('#btnAuthSignup');
  
  if (btnLogin) {
    btnLogin.disabled = loading;
    btnLogin.style.opacity = loading ? '0.6' : '1';
    btnLogin.style.pointerEvents = loading ? 'none' : 'auto';
    btnLogin.innerHTML = loading ? __('auth.login_loading') : __('auth.login_btn', null, 'Acessar Dashboard');
  }
  
  if (btnSignup) {
    btnSignup.disabled = loading;
    btnSignup.style.opacity = loading ? '0.6' : '1';
    btnSignup.style.pointerEvents = loading ? 'none' : 'auto';
    btnSignup.innerHTML = loading ? __('auth.signup_loading') : __('auth.signup_btn', null, 'Criar Conta');
  }
}

async function handleLoginSubmit() {
  const email = $('#inputAuthEmail').value;
  const pass = $('#inputAuthPassword').value;
  
  setAuthLoading(true);
  const result = await AuthService.login(email, pass);
  setAuthLoading(false);
  
  if (result.success) {
    if (email === 'kenioclaudino0013@gmail.com') seedKenioWorkout();
    loginUser();
  } else {
    const msg = result.error === AuthError.INVALID_EMAIL ? __('auth.invalid_email', null, 'E-mail inválido')
             : result.error === AuthError.EMPTY_FIELDS ? __('auth.fill_fields', null, 'Preencha os campos')
              : __('auth.login_error');
    DS.toast(msg, 'error');
  }
}

const _btnLogin = $('#btnAuthLogin');
if (_btnLogin) _btnLogin.addEventListener('click', handleLoginSubmit);
const _inputPass = $('#inputAuthPassword');
if (_inputPass) _inputPass.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleLoginSubmit(); });
const _inputEmail = $('#inputAuthEmail');
if (_inputEmail) _inputEmail.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleLoginSubmit(); });

async function handleSignupSubmit() {
  const email = $('#inputSignupEmail').value;
  const pass = $('#inputSignupPassword').value;
  const pass2 = $('#inputSignupPasswordRepeat').value;
  
  setAuthLoading(true);
  const result = await AuthService.signup(email, pass, pass2);
  setAuthLoading(false);
  
  if (result.success) {
    DS.toast(__('auth.account_created', null, 'Conta criada com sucesso!'), 'success');
    if (email === 'kenioclaudino0013@gmail.com') seedKenioWorkout();
    loginUser();
  } else {
    const msg = result.error === AuthError.PASSWORD_MISMATCH ? __('auth.password_mismatch', null, 'As senhas não coincidem')
             : result.error === AuthError.INVALID_EMAIL ? __('auth.invalid_email', null, 'E-mail inválido')
             : result.error === AuthError.EMPTY_FIELDS ? __('auth.fill_fields', null, 'Preencha todos os campos')
              : __('auth.signup_error');
    DS.toast(msg, 'error');
  }
}

const _btnSignup = $('#btnAuthSignup');
if (_btnSignup) _btnSignup.addEventListener('click', handleSignupSubmit);
const _inputSignupEmail = $('#inputSignupEmail');
if (_inputSignupEmail) _inputSignupEmail.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSignupSubmit(); });
const _inputSignupPass = $('#inputSignupPassword');
if (_inputSignupPass) _inputSignupPass.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSignupSubmit(); });
const _inputSignupPass2 = $('#inputSignupPasswordRepeat');
if (_inputSignupPass2) _inputSignupPass2.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSignupSubmit(); });
// =================================

let selectedDate = new Date();
let editingBlockId = null;
function dateKey(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function formatWeekday(d) {
  return d.toLocaleDateString(I18n.locale, { weekday: 'short' }).replace('.', '').toUpperCase();
}

function formatFullDate(d) {
  return d.toLocaleDateString(I18n.locale, { weekday: 'long', day: 'numeric', month: 'long' });
}

function calcMinutes(start, end) {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  return e > s ? e - s : (MINUTES_IN_DAY - s) + e;
}

function durationLabel(start, end) {
  const mins = calcMinutes(start, end);
  if (mins <= 0) return '';
  if (mins < 60) return I18n.t('duration.minutes', { n: mins });
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? I18n.t('duration.hours_minutes', { h, m }) : I18n.t('duration.hours', { h });
}

function totalMinutes(blocks) {
  return blocks.reduce((acc, b) => acc + calcMinutes(b.start, b.end), 0);
}

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// ===== LOGGER =====
function logAction(message) {
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const dateStr = formatWeekday(now);
  state.logs.unshift({
    id: uid(),
    timestamp: `${dateStr} ${timeStr}`,
    message
  });
  if (state.logs.length > MAX_LOG_SIZE) state.logs.pop();
  Store.save(state);
  renderLogs();
}

function renderLogs() {
  const container = $('#logsList');
  if (!container) return;
  
  if (!state.logs || state.logs.length === 0) {
    container.innerHTML = `<div class="ds-list-item log-empty">${I18n.t('log.empty')}</div>`;
    return;
  }
  
  container.innerHTML = state.logs.map(log => `
    <div class="ds-list-item log-item">
      <span class="log-timestamp">${log.timestamp}</span>
      <span class="log-message">${DS.escapeHtml(log.message)}</span>
    </div>
  `).join('');
}

// ===== SVG PIZZA =====
const SVG_NS = 'http://www.w3.org/2000/svg';
const CX = 200, CY = 200, R_OUTER = 170, R_INNER = 120, R_LABELS = 190;

function minutesToAngle(minutes) {
  const dayStart = DAY_START * 60;
  const dayEnd = DAY_END * 60;
  const totalDay = dayEnd - dayStart;
  const clamped = Math.max(dayStart, Math.min(dayEnd, minutes));
  return ((clamped - dayStart) / totalDay) * 360 - 90; // -90 so 12 o'clock is top
}

function polarToXY(angleDeg, radius) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + radius * Math.cos(rad), y: CY + radius * Math.sin(rad) };
}

// Pick white or dark icon color based on slice background luminance
function iconContrastColor(hex) {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  // Relative luminance (WCAG formula)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55 ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.9)';
}

// SVG icon paths for each subject type — Lucide-style, clean strokes
function sliceIcon(type, x, y, size, fillColor) {
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('transform', `translate(${x - size/2}, ${y - size/2})`);
  g.setAttribute('pointer-events', 'none');
  g.setAttribute('class', `slice-icon slice-icon--${type}`);

  const s = size / 24; // scale factor from 24x24 viewbox
  const sw = `${1.8 * s}`;

  if (type === 'study') {
    // Open book (Lucide book-open style)
    const left = document.createElementNS(SVG_NS, 'path');
    left.setAttribute('d', `M${2*s},${3*s} C${2*s},${3*s} ${6*s},${2*s} ${12*s},${4*s} L${12*s},${21*s} C${6*s},${19*s} ${2*s},${20*s} ${2*s},${20*s} Z`);
    left.setAttribute('fill', 'none');
    left.setAttribute('stroke', fillColor);
    left.setAttribute('stroke-width', sw);
    left.setAttribute('stroke-linejoin', 'round');
    g.appendChild(left);
    const right = document.createElementNS(SVG_NS, 'path');
    right.setAttribute('d', `M${22*s},${3*s} C${22*s},${3*s} ${18*s},${2*s} ${12*s},${4*s} L${12*s},${21*s} C${18*s},${19*s} ${22*s},${20*s} ${22*s},${20*s} Z`);
    right.setAttribute('fill', 'none');
    right.setAttribute('stroke', fillColor);
    right.setAttribute('stroke-width', sw);
    right.setAttribute('stroke-linejoin', 'round');
    g.appendChild(right);
  } else if (type === 'training') {
    // Dumbbell — thick bar with rounded weights
    const bar = document.createElementNS(SVG_NS, 'line');
    bar.setAttribute('x1', `${6*s}`); bar.setAttribute('y1', `${12*s}`);
    bar.setAttribute('x2', `${18*s}`); bar.setAttribute('y2', `${12*s}`);
    bar.setAttribute('stroke', fillColor);
    bar.setAttribute('stroke-width', `${2.5*s}`);
    bar.setAttribute('stroke-linecap', 'round');
    g.appendChild(bar);
    // Left weight plates
    [{ x: 2, w: 3, h: 10 }, { x: 5, w: 2, h: 7 }].forEach(p => {
      const r = document.createElementNS(SVG_NS, 'rect');
      r.setAttribute('x', `${p.x*s}`); r.setAttribute('y', `${(12 - p.h/2)*s}`);
      r.setAttribute('width', `${p.w*s}`); r.setAttribute('height', `${p.h*s}`);
      r.setAttribute('rx', `${1.2*s}`);
      r.setAttribute('fill', fillColor); r.setAttribute('opacity', '0.25');
      r.setAttribute('stroke', fillColor); r.setAttribute('stroke-width', sw);
      g.appendChild(r);
    });
    // Right weight plates (mirrored)
    [{ x: 19, w: 3, h: 10 }, { x: 17, w: 2, h: 7 }].forEach(p => {
      const r = document.createElementNS(SVG_NS, 'rect');
      r.setAttribute('x', `${p.x*s}`); r.setAttribute('y', `${(12 - p.h/2)*s}`);
      r.setAttribute('width', `${p.w*s}`); r.setAttribute('height', `${p.h*s}`);
      r.setAttribute('rx', `${1.2*s}`);
      r.setAttribute('fill', fillColor); r.setAttribute('opacity', '0.25');
      r.setAttribute('stroke', fillColor); r.setAttribute('stroke-width', sw);
      g.appendChild(r);
    });
  } else {
    // Routine — rounded checkbox with animated check
    const box = document.createElementNS(SVG_NS, 'rect');
    box.setAttribute('x', `${4*s}`); box.setAttribute('y', `${4*s}`);
    box.setAttribute('width', `${16*s}`); box.setAttribute('height', `${16*s}`);
    box.setAttribute('rx', `${4*s}`);
    box.setAttribute('fill', fillColor); box.setAttribute('fill-opacity', '0.12');
    box.setAttribute('stroke', fillColor);
    box.setAttribute('stroke-width', sw);
    g.appendChild(box);
    // Checkmark
    const check = document.createElementNS(SVG_NS, 'polyline');
    check.setAttribute('points', `${8*s},${12.5*s} ${11*s},${15.5*s} ${16*s},${9*s}`);
    check.setAttribute('fill', 'none'); check.setAttribute('stroke', fillColor);
    check.setAttribute('stroke-width', `${2.2*s}`);
    check.setAttribute('stroke-linecap', 'round');
    check.setAttribute('stroke-linejoin', 'round');
    g.appendChild(check);
  }
  return g;
}

// Inline SVG icon string for block cards (type badge)
function blockTypeIconSvg(type, color) {
  const icons = {
    study: `<svg class="ds-icon ds-icon--sm ds-icon--rock" viewBox="0 0 24 24" style="color:${color}">
      <path d="M2 3c0 0 4-1 10 1v18c-6-2-10-1-10-1z"/><path d="M22 3c0 0-4-1-10 1v18c6-2 10-1 10-1z"/>
    </svg>`,
    training: `<svg class="ds-icon ds-icon--sm ds-icon--bounce" viewBox="0 0 24 24" style="color:${color}">
      <line x1="7" y1="12" x2="17" y2="12" stroke-width="2.5" stroke-linecap="round"/>
      <rect x="2" y="7" width="4" height="10" rx="1.5"/><rect x="18" y="7" width="4" height="10" rx="1.5"/>
    </svg>`,
    inactive: `<svg class="ds-icon ds-icon--sm ds-icon--wobble" viewBox="0 0 24 24" style="color:${color}">
      <rect x="4" y="4" width="16" height="16" rx="4"/><polyline points="8 12.5 11 15.5 16 9"/>
    </svg>`,
  };
  return icons[type] || icons.study;
}

function arcPath(startAngle, endAngle, outerR, innerR) {
  if (endAngle < startAngle) endAngle += 360;
  if (endAngle - startAngle >= 359.99) endAngle = startAngle + 359.99;
  const largeArc = (endAngle - startAngle) > 180 ? 1 : 0;

  const p1 = polarToXY(startAngle, outerR);
  const p2 = polarToXY(endAngle, outerR);
  const p3 = polarToXY(endAngle, innerR);
  const p4 = polarToXY(startAngle, innerR);

  return [
    `M ${p1.x} ${p1.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${p4.x} ${p4.y}`,
    'Z'
  ].join(' ');
}

function renderPizza() {
  const svg = $('#pizzaSvg');
  svg.innerHTML = '';

  const dayStart = DAY_START;
  const dayEnd = DAY_END;
  const dayBlocks = state.blocks
    .filter(b => b.date === dateKey(selectedDate))
    .sort((a, b) => a.start.localeCompare(b.start));

  // Background ring
  const bgCircle = document.createElementNS(SVG_NS, 'circle');
  bgCircle.setAttribute('cx', CX);
  bgCircle.setAttribute('cy', CY);
  bgCircle.setAttribute('r', R_OUTER);
  bgCircle.setAttribute('fill', 'var(--ds-bg-card)');
  svg.appendChild(bgCircle);

  // Inner hole
  const innerCircle = document.createElementNS(SVG_NS, 'circle');
  innerCircle.setAttribute('cx', CX);
  innerCircle.setAttribute('cy', CY);
  innerCircle.setAttribute('r', R_INNER);
  innerCircle.setAttribute('fill', 'var(--ds-bg-primary)');
  svg.appendChild(innerCircle);

  // Hour ticks and labels
  const totalHours = dayEnd - dayStart;
  for (let h = dayStart; h <= dayEnd; h++) {
    const angle = minutesToAngle(h * 60);
    const outerP = polarToXY(angle, R_OUTER);
    const innerP = polarToXY(angle, R_OUTER - 8);

    // Skip end tick if it overlaps the start (full circle)
    const isLast = h === dayEnd;
    if (isLast) continue;

    const tick = document.createElementNS(SVG_NS, 'line');
    tick.setAttribute('x1', innerP.x);
    tick.setAttribute('y1', innerP.y);
    tick.setAttribute('x2', outerP.x);
    tick.setAttribute('y2', outerP.y);
    tick.setAttribute('class', 'pizza-tick');
    tick.setAttribute('stroke-width', h % 3 === 0 ? '2' : '1');
    svg.appendChild(tick);

    // Label frequency based on range size
    const showLabel = totalHours <= 12 || h % 2 === 0;
    if (showLabel) {
      const displayH = h % 24; // 24 → 0
      const labelP = polarToXY(angle, R_OUTER + 16);
      const label = document.createElementNS(SVG_NS, 'text');
      label.setAttribute('x', labelP.x);
      label.setAttribute('y', labelP.y);
      label.setAttribute('class', 'pizza-hour-label');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'central');
      label.textContent = I18n.t('duration.hours', { h: displayH });
      svg.appendChild(label);
    }
  }

  // Slices
  if (dayBlocks.length === 0) {
    // Empty state — no slices to draw
  } else {
    const dayStartMin = dayStart * 60;
    const dayEndMin = dayEnd * 60;

    dayBlocks.forEach(block => {
      const subj = state.subjects.find(s => s.id === block.subjectId);
      const color = subj?.color || '#8e8e93';
      const startMin = timeToMinutes(block.start);
      const endMin = timeToMinutes(block.end);
      const isOvernight = endMin <= startMin;
      const isInactive = subj?.type === 'inactive';

      // Build list of visible segments (overnight block produces one continuous segment)
      const segments = [];
      const vs = Math.max(startMin, dayStartMin);
      const ve = Math.min(endMin, dayEndMin);
      
      if (isOvernight) {
        segments.push({ s: startMin, e: endMin });
      } else {
        if (ve > vs) segments.push({ s: vs, e: ve });
      }

      segments.forEach(seg => {
        if (!isOvernight && seg.e <= seg.s) return;

        let sa = minutesToAngle(seg.s);
        let ea = minutesToAngle(seg.e);
        if (isOvernight && ea <= sa) {
          ea += 360;
        }

        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', arcPath(sa, ea, R_OUTER - 1, R_INNER + 1));
        path.setAttribute('fill', color);
        if (isInactive) path.setAttribute('opacity', '0.3');
        const sliceClasses = ['pizza-slice'];
        if (block.done) sliceClasses.push('done-slice');
        if (isInactive) sliceClasses.push('inactive-slice');
        path.setAttribute('class', sliceClasses.join(' '));
        path.setAttribute('data-id', block.id);
        path.addEventListener('click', () => openBlockModal(block.id));
        svg.appendChild(path);

        // Slice icon (type-based, centered in arc)
        const midAngle = (sa + ea) / 2;
        const midR = (R_OUTER + R_INNER) / 2;
        const midP = polarToXY(midAngle, midR);
        const arcSpan = ea - sa;

        if (arcSpan > 8) {
          const iconSize = arcSpan > 25 ? 20 : 14;
          const iconColor = isInactive ? 'var(--ds-text-tertiary)' : iconContrastColor(color);
          const icon = sliceIcon(subj?.type || 'study', midP.x, midP.y, iconSize, iconColor);
          svg.appendChild(icon);
        }
      });
    });
  }

  // "Now" indicator (only for today)
  if (dateKey(selectedDate) === dateKey(new Date())) {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const dayStartMin = dayStart * 60;
    const dayEndMin = dayEnd * 60;

    if (nowMin >= dayStartMin && nowMin <= dayEndMin) {
      const nowAngle = minutesToAngle(nowMin);

      // Smart contrast: detect if 'now' is inside a block
      let indicatorColor = 'var(--ds-danger)';
      for (const b of dayBlocks) {
        const [sh, sm] = b.start.split(':').map(Number);
        const [eh, em] = b.end.split(':').map(Number);
        const startM = sh * 60 + sm;
        const endM = eh * 60 + em;
        if (nowMin >= startM && nowMin < endM) {
          const s = state.subjects.find(sub => sub.id === b.subjectId);
          if (s) {
            indicatorColor = s.type === 'inactive' ? 'var(--ds-text-tertiary)' : iconContrastColor(s.color);
          }
          break;
        }
      }

      const p1 = polarToXY(nowAngle, R_INNER + 4);
      const p2 = polarToXY(nowAngle, R_OUTER - 2);

      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', p1.x);
      line.setAttribute('y1', p1.y);
      line.setAttribute('x2', p2.x);
      line.setAttribute('y2', p2.y);
      line.setAttribute('class', 'pizza-now-line');
      line.style.stroke = indicatorColor;
      svg.appendChild(line);

      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', p2.x);
      dot.setAttribute('cy', p2.y);
      dot.setAttribute('r', '5');
      dot.setAttribute('class', 'pizza-now-dot');
      dot.style.fill = indicatorColor;
      dot.style.stroke = 'var(--ds-bg-primary)';
      dot.style.strokeWidth = '1.5px';
      svg.appendChild(dot);
    }
  }

  // Stats (exclude inactive from completion tracking)
  const activeBlocks = dayBlocks.filter(b => {
    const s = state.subjects.find(s => s.id === b.subjectId);
    return s?.type !== 'inactive';
  });
  const done = activeBlocks.filter(b => b.done).length;
  const pct = activeBlocks.length > 0 ? Math.round((done / activeBlocks.length) * 100) : 0;
  $('#pizzaCenterLabel').textContent = activeBlocks.length > 0
    ? I18n.t('pizza.completed', { done, total: activeBlocks.length })
    : '';

  // Progress bar
  const centerEl = $('#pizzaCenter');
  const progressEl = $('#pizzaProgress');
  const fillEl = $('#pizzaProgressFill');
  
  // Sempre mostra o centro (0h / PLANEJADO)
  centerEl.style.display = '';

  if (dayBlocks.length > 0) {
    progressEl.style.display = '';
    fillEl.style.width = `${pct}%`;
    if (pct === 100) fillEl.style.background = 'var(--ds-success)';
    else fillEl.style.background = 'var(--ds-accent)';
  } else {
    progressEl.style.display = 'none';
  }
}

// ===== RENDER: BLOCK LIST =====
const activeExpandedBlocks = new Set();

function renderBlockList() {
  const container = $('#blockList');
  const dayBlocks = state.blocks
    .filter(b => b.date === dateKey(selectedDate))
    .sort((a, b) => a.start.localeCompare(b.start));

  if (dayBlocks.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = dayBlocks.map(block => {
    const subj = state.subjects.find(s => s.id === block.subjectId);
    const color = subj?.color || '#8e8e93';
    const dur = durationLabel(block.start, block.end);
    const isExpanded = activeExpandedBlocks.has(block.id);

    // Topic summary or status depending on profile type
    let topicName = block.topic || '';
    if (subj?.type === 'study') {
      const selectedId = block.selectedSyllabusId;
      const currentTopic = subj.syllabus?.find(item => item.id === selectedId);
      topicName = currentTopic ? `${currentTopic.topic} ${currentTopic.duration ? '('+currentTopic.duration+' min)' : ''}` : I18n.t('syllabus.select_topic');
    } else if (subj?.type === 'training') {
      const total = subj.exercises?.length || 0;
      const done = block.completedItems?.length || 0;
      topicName = I18n.t('block.training_summary', { done, total });
    } else if (subj?.type === 'inactive') {
      const total = subj.checklist?.length || 0;
      const done = block.completedItems?.length || 0;
      topicName = I18n.t('block.routine_summary', { done, total });
    }

    // Build the collapsed details body
    let detailsHtml = '';
    if (isExpanded) {
      if (subj?.type === 'study') {
        const syllabus = subj.syllabus || [];
        const selectedId = block.selectedSyllabusId;
        const currentTopic = syllabus.find(item => item.id === selectedId);

        detailsHtml = `
          <div class="block-details">
            <div class="form-group" style="margin-bottom:0; width:100%;">
              <label class="ds-label" style="font-size:10px;">${I18n.t('syllabus.label')}</label>
              <select class="ds-select select-block-syllabus block-syllabus-select" data-block-id="${block.id}">
                <option value="">${I18n.t('syllabus.select_prompt')}</option>
                ${syllabus.map(item => `<option value="${item.id}" ${item.id === selectedId ? 'selected' : ''}>[${item.status === 'completed' ? '\u2713' : '\u25CB'}] ${DS.escapeHtml(item.topic)}</option>`).join('')}
              </select>
            </div>
            ${currentTopic ? `
              <div class="block-details-item">
                <span class="ds-truncate syllabus-desc">${DS.escapeHtml(currentTopic.description || I18n.t('syllabus.no_description'))}</span>
                <button class="ds-btn ${currentTopic.status === 'completed' ? 'ds-btn-tinted' : 'ds-btn-filled'} btn-toggle-syllabus-status" data-syllabus-id="${currentTopic.id}" data-block-id="${block.id}" style="font-size:11px; padding:4px 8px; flex-shrink:0;">
                  ${currentTopic.status === 'completed' ? I18n.t('syllabus.pending') : I18n.t('syllabus.complete')}
                </button>
              </div>
            ` : ''}
            <div class="block-details-footer" style="display:flex; gap:8px;">
              <button class="ds-btn ds-btn-plain btn-edit-block-time" data-block-id="${block.id}" style="flex:1; font-size:11px; padding:4px 8px;">
                ${DS.icon('clock', { size: 14 })} ${I18n.t('block.edit_time')}
              </button>
              <button class="ds-btn ds-btn-plain btn-edit-subject-content" data-subject-type="study" data-subject-id="${subj?.id}" style="flex:1; font-size:11px; padding:4px 8px;">
                ${DS.icon('edit', { size: 14 })} ${I18n.t('block.edit_syllabus')}
              </button>
            </div>
          </div>
        `;
      } else if (subj?.type === 'training') {
        const exercises = subj.exercises || [];
        const completedItems = block.completedItems || [];

        detailsHtml = `
          <div class="block-details">
            <label class="ds-label" style="font-size:10px;">${I18n.t('exercise.sheet')}</label>
            ${exercises.length === 0 ? `<p class="subject-empty">${I18n.t('exercise.none')}</p>` :
              `<div class="block-details-list">
                ${exercises.map(ex => {
                  const isChecked = completedItems.includes(ex.id);
                  return `
                    <div class="block-details-item">
                      <label>
                        <input type="checkbox" class="chk-exercise-item" data-block-id="${block.id}" data-ex-id="${ex.id}" ${isChecked ? 'checked' : ''}>
                        <span class="${isChecked ? 'item-done' : ''} ds-truncate">${DS.escapeHtml(ex.name)}</span>
                      </label>
                      <span class="item-meta">${ex.sets}x${ex.reps} (${ex.weight})</span>
                    </div>
                  `;
                }).join('')}
              </div>`
            }
            <div class="block-details-footer" style="display:flex; gap:8px;">
              <button class="ds-btn ds-btn-plain btn-edit-block-time" data-block-id="${block.id}" style="flex:1; font-size:11px; padding:4px 8px;">
                ${DS.icon('clock', { size: 14 })} ${I18n.t('block.edit_time')}
              </button>
              <button class="ds-btn ds-btn-plain btn-edit-subject-content" data-subject-type="training" data-subject-id="${subj?.id}" style="flex:1; font-size:11px; padding:4px 8px;">
                ${DS.icon('edit', { size: 14 })} ${I18n.t('block.edit_exercise')}
              </button>
            </div>
          </div>
        `;
      } else if (subj?.type === 'inactive') {
        const checklist = subj.checklist || [];
        const completedItems = block.completedItems || [];

        detailsHtml = `
          <div class="block-details">
            <label class="ds-label" style="font-size:10px;">${I18n.t('routine.label')}</label>
            ${checklist.length === 0 ? `<p class="subject-empty">${I18n.t('routine.none')}</p>` :
              `<div class="block-details-list">
                ${checklist.map(task => {
                  const isChecked = completedItems.includes(task.id);
                  return `
                    <div class="block-details-item">
                      <label>
                        <input type="checkbox" class="chk-routine-item" data-block-id="${block.id}" data-task-id="${task.id}" ${isChecked ? 'checked' : ''}>
                        <span class="${isChecked ? 'item-done' : ''} ds-truncate">${DS.escapeHtml(task.task)}</span>
                      </label>
                    </div>
                  `;
                }).join('')}
              </div>`
            }
            <div class="block-details-footer" style="display:flex; gap:8px;">
              <button class="ds-btn ds-btn-plain btn-edit-block-time" data-block-id="${block.id}" style="flex:1; font-size:11px; padding:4px 8px;">
                ${DS.icon('clock', { size: 14 })} ${I18n.t('block.edit_time')}
              </button>
              <button class="ds-btn ds-btn-plain btn-edit-subject-content" data-subject-type="inactive" data-subject-id="${subj?.id}" style="flex:1; font-size:11px; padding:4px 8px;">
                ${DS.icon('edit', { size: 14 })} ${I18n.t('block.edit_routine')}
              </button>
            </div>
          </div>
        `;
      }
    }

    const typeKey = subj?.type || 'study';
    const typeIcon = blockTypeIconSvg(typeKey, color);

    return `
      <div class="block-item-container">
        <div class="block-card ${block.done ? 'done' : ''} ${isExpanded ? 'expanded' : ''}" style="--block-color:${color}" data-id="${block.id}">
          <div class="block-type-badge ds-icon-animate">
            ${typeIcon}
          </div>
          <div class="block-info">
            <div class="block-subject">
              ${DS.escapeHtml(subj?.name) || I18n.t('block.no_subject')}
              <span class="block-chevron">${DS.icon(isExpanded ? 'chevronD' : 'chevronR', { size: 14 })}</span>
            </div>
            <div class="block-meta">
              <span class="block-time-badge">${block.start} – ${block.end}</span>
              ${dur ? `<span class="block-duration-pill">${dur}</span>` : ''}
            </div>
            <div class="block-topic">${DS.escapeHtml(topicName)}</div>
          </div>
          <button class="block-check ${block.done ? 'checked' : ''}" data-block-id="${block.id}">
            ${DS.icon('check', { size: 16, strokeWidth: 3 })}
          </button>
        </div>
        ${detailsHtml}
      </div>
    `;
  }).join('');

  // Expand/collapse click binder
  container.querySelectorAll('.block-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.block-check')) return; // Avoid toggle on checkbox click
      const id = card.dataset.id;
      if (activeExpandedBlocks.has(id)) {
        activeExpandedBlocks.delete(id);
      } else {
        activeExpandedBlocks.add(id);
      }
      renderBlockList();
    });
  });

  // Block completion click binder
  container.querySelectorAll('.block-check').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const block = state.blocks.find(b => b.id === btn.dataset.blockId);
      if (block) {
        block.done = !block.done;
        // Haptic feedback
        if (navigator.vibrate) navigator.vibrate(block.done ? [15, 30, 15] : 10);
        const subj = state.subjects.find(s => s.id === block.subjectId);
        logAction(I18n.t(block.done ? 'log.block_done' : 'log.block_undone', { name: subj?.name || block.topic }));
        Store.save(state);
        render();
      }
    });
  });

  // Exercise checkbox click binder
  container.querySelectorAll('.chk-exercise-item').forEach(chk => {
    chk.addEventListener('change', () => {
      const blockId = chk.dataset.blockId;
      const exId = chk.dataset.exId;
      const block = state.blocks.find(b => b.id === blockId);
      if (block) {
        if (!block.completedItems) block.completedItems = [];
        if (chk.checked) {
          if (!block.completedItems.includes(exId)) block.completedItems.push(exId);
        } else {
          block.completedItems = block.completedItems.filter(id => id !== exId);
        }
        
        // Auto-complete block if all exercises are done
        const subj = state.subjects.find(s => s.id === block.subjectId);
        const total = subj?.exercises?.length || 0;
        if (total > 0 && block.completedItems.length === total) {
          block.done = true;
        } else if (!chk.checked) {
          block.done = false;
        }
        const exItem = subj?.exercises?.find(x => x.id === exId);
        logAction(I18n.t(chk.checked ? 'log.exercise_done' : 'log.exercise_undone', { name: exItem?.name || exId }));
        Store.save(state);
        render();
      }
    });
  });

  // Routine checkbox click binder
  container.querySelectorAll('.chk-routine-item').forEach(chk => {
    chk.addEventListener('change', () => {
      const blockId = chk.dataset.blockId;
      const taskId = chk.dataset.taskId;
      const block = state.blocks.find(b => b.id === blockId);
      if (block) {
        if (!block.completedItems) block.completedItems = [];
        if (chk.checked) {
          if (!block.completedItems.includes(taskId)) block.completedItems.push(taskId);
        } else {
          block.completedItems = block.completedItems.filter(id => id !== taskId);
        }

        // Auto-complete block if all routine tasks are done
        const subj = state.subjects.find(s => s.id === block.subjectId);
        const total = subj?.checklist?.length || 0;
        if (total > 0 && block.completedItems.length === total) {
          block.done = true;
        } else if (!chk.checked) {
          block.done = false;
        }
        const routineItem = subj?.checklist?.find(x => x.id === taskId);
        logAction(I18n.t(chk.checked ? 'log.routine_done' : 'log.routine_undone', { name: routineItem?.title || taskId }));
        Store.save(state);
        render();
      }
    });
  });

  // Syllabus dropdown change binder
  container.querySelectorAll('.select-block-syllabus').forEach(select => {
    select.addEventListener('change', () => {
      const blockId = select.dataset.blockId;
      const syllabusId = select.value;
      const block = state.blocks.find(b => b.id === blockId);
      if (block) {
        block.selectedSyllabusId = syllabusId;
        Store.save(state);
        render();
      }
    });
  });

  // Syllabus mark-complete button click binder
  container.querySelectorAll('.btn-toggle-syllabus-status').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const blockId = btn.dataset.blockId;
      const syllabusId = btn.dataset.syllabusId;
      const block = state.blocks.find(b => b.id === blockId);
      const subj = state.subjects.find(s => s.id === block?.subjectId);
      const topic = subj?.syllabus?.find(item => item.id === syllabusId);
      
      if (topic) {
        topic.status = topic.status === 'completed' ? 'pending' : 'completed';
        if (topic.status === 'completed') {
          block.done = true;
        } else {
          block.done = false;
        }
        logAction(I18n.t(topic.status === 'completed' ? 'log.syllabus_done' : 'log.syllabus_undone', { name: topic.topic }));
        Store.save(state);
        render();
      }
    });
  });

  // Inner block edit click binder
  container.querySelectorAll('.btn-edit-block-time').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openBlockModal(btn.dataset.blockId);
    });
  });

  // Inner block content edit click binder
  container.querySelectorAll('.btn-edit-subject-content').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btn.dataset.subjectId && btn.dataset.subjectId !== 'undefined') {
        openSubjectModal(btn.dataset.subjectType, btn.dataset.subjectId);
      }
    });
  });
}

// ===== RENDER: WEEK NAV =====
function renderWeekNav() {
  const nav = $('#weekNav');
  nav.innerHTML = '';
  const today = new Date();
  const startOfWeek = new Date(selectedDate);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

  // Btn Prev Week
  const btnPrev = document.createElement('button');
  btnPrev.className = 'week-nav-arrow';
  btnPrev.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"></polyline></svg>`;
  btnPrev.addEventListener('click', () => {
    selectedDate.setDate(selectedDate.getDate() - 7);
    render();
  });
  nav.appendChild(btnPrev);

  // Scroll Container
  const daysScroll = document.createElement('div');
  daysScroll.className = 'week-days-scroll';

  for (let i = 0; i < 7; i++) {
    const day = new Date(startOfWeek);
    day.setDate(startOfWeek.getDate() + i);

    const btn = document.createElement('button');
    btn.className = 'week-day';
    if (dateKey(day) === dateKey(selectedDate)) btn.classList.add('active');
    if (dateKey(day) === dateKey(today)) btn.classList.add('today');

    const dayBlocks = state.blocks.filter(b => b.date === dateKey(day));
    const dotsHTML = dayBlocks.slice(0, 3).map(b => {
      const subj = state.subjects.find(s => s.id === b.subjectId);
      return `<span class="day-dot" style="background:${subj?.color || '#8e8e93'}"></span>`;
    }).join('');

    btn.innerHTML = `
      <span class="day-label">${formatWeekday(day)}</span>
      <span class="day-number">${day.getDate()}</span>
      <span class="day-dots">${dotsHTML}</span>
    `;
    btn.addEventListener('click', () => { selectedDate = new Date(day); render(); });
    daysScroll.appendChild(btn);
  }

  nav.appendChild(daysScroll);

  // Btn Next Week
  const btnNext = document.createElement('button');
  btnNext.className = 'week-nav-arrow';
  btnNext.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
  btnNext.addEventListener('click', () => {
    selectedDate.setDate(selectedDate.getDate() + 7);
    render();
  });
  nav.appendChild(btnNext);
}

// Swipe week navigation
function initWeekSwipe() {
  const nav = $('#weekNav');
  let startX = 0;
  let startY = 0;
  let swiping = false;

  nav.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    swiping = true;
  }, { passive: true });

  nav.addEventListener('touchmove', (e) => {
    if (!swiping) return;
    const dy = Math.abs(e.touches[0].clientY - startY);
    const dx = Math.abs(e.touches[0].clientX - startX);
    // Cancel if vertical scroll
    if (dy > dx) { swiping = false; }
  }, { passive: true });

  nav.addEventListener('touchend', (e) => {
    if (!swiping) return;
    swiping = false;
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) < 50) return; // minimum swipe distance

    if (dx < 0) {
      // Swipe left → next week
      selectedDate.setDate(selectedDate.getDate() + 7);
    } else {
      // Swipe right → previous week
      selectedDate.setDate(selectedDate.getDate() - 7);
    }
    nav.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
    nav.style.transform = `translateX(${dx < 0 ? '-30' : '30'}px)`;
    nav.style.opacity = '0.3';
    setTimeout(() => {
      render();
      nav.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
      nav.style.transform = `translateX(${dx < 0 ? '30' : '-30'}px)`;
      requestAnimationFrame(() => {
        nav.style.transform = 'translateX(0)';
        nav.style.opacity = '1';
      });
    }, 180);
  });
}

// ===== RENDER: SUBJECTS (grouped by type) =====
function renderSubjects() {
  const list = $('#subjectsList');

  const typeOrder = ['study', 'training', 'inactive'];
  const sections = typeOrder.map(type => {
    const cfg = TYPES[type];
    const items = state.subjects.filter(s => s.type === type);
    return { type, cfg, items };
  });

  if (state.subjects.length === 0) {
    list.innerHTML = `<p class="subject-empty">${I18n.t('subject.empty')}</p>`;
    return;
  }

  const sectionIcons = {
    study: `<svg class="ds-icon ds-icon--rock" viewBox="0 0 24 24"><path d="M2 3c0 0 4-1 10 1v18c-6-2-10-1-10-1z"/><path d="M22 3c0 0-4-1-10 1v18c6-2 10-1 10-1z"/></svg>`,
    training: `<svg class="ds-icon ds-icon--bounce" viewBox="0 0 24 24"><line x1="7" y1="12" x2="17" y2="12" stroke-width="2.5" stroke-linecap="round"/><rect x="2" y="7" width="4" height="10" rx="1.5"/><rect x="18" y="7" width="4" height="10" rx="1.5"/></svg>`,
    inactive: `<svg class="ds-icon ds-icon--wobble" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4"/><polyline points="8 12.5 11 15.5 16 9"/></svg>`,
  };

  list.innerHTML = sections.map(({ type, cfg, items }) => `
    <div class="subject-section">
      <div class="subject-section-header ds-icon-animate">
        <span class="subject-section-icon">${sectionIcons[type] || DS.icon(cfg.icon, { size: 18 })}</span>
        <span class="subject-section-title">${DS.escapeHtml(I18n.t(cfg.i18nKey))}</span>
        <span class="subject-section-count">${items.length}</span>
        <button class="ds-btn ds-btn-icon-sm subject-section-add" data-type="${type}" aria-label="${I18n.t(cfg.i18nKey)}">
          ${DS.icon('plus', { size: 16, strokeWidth: 2.5 })}
        </button>
      </div>
      <div class="subject-sortable-list" data-type="${type}">
        ${items.length === 0 ? `<p class="subject-empty">${I18n.t('subject.none')}</p>` : items.map(s => {
          const count = state.blocks.filter(b => b.subjectId === s.id).length;
          return `
            <div class="subject-card" data-subject-id="${s.id}" data-type="${s.type}" style="cursor:pointer; touch-action:none;">
              <span class="subject-dot" style="background:${s.color}"></span>
              <span class="subject-name">${DS.escapeHtml(s.name)}</span>
              <span class="subject-count">${I18n.t('block.count', { count })}</span>
              <button class="subject-delete" data-subject-id="${s.id}">
                ${DS.icon('x', { size: 18 })}
              </button>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `).join('');

  // Click on card to edit profile
  list.querySelectorAll('.subject-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.subject-delete')) return;
      openSubjectModal(card.dataset.type, card.dataset.subjectId);
    });
  });

  // Per-section add buttons
  list.querySelectorAll('.subject-section-add').forEach(btn => {
    btn.addEventListener('click', () => openSubjectModal(btn.dataset.type));
  });

  list.querySelectorAll('.subject-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await DS.confirm(I18n.t('subject.delete_title'), I18n.t('subject.delete_msg'), I18n.t('confirm.delete'));
      if (ok) {
        const id = btn.dataset.subjectId;
        const deleted = state.subjects.find(s => s.id === id);
        logAction(I18n.t('log.deleted_profile', { name: deleted?.name }));
        state.subjects = state.subjects.filter(s => s.id !== id);
        state.blocks = state.blocks.filter(b => b.subjectId !== id);
        Store.save(state);
        render();
        renderSubjects();
      }
    });
  });

  if (window.Sortable) {
    list.querySelectorAll('.subject-sortable-list').forEach(el => {
      new Sortable(el, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        delay: 250, // Clicar e segurar
        delayOnTouchOnly: true,
        onEnd: function (evt) {
          const type = el.dataset.type;
          const newOrderIds = Array.from(el.children).map(c => c.dataset.subjectId).filter(Boolean);
          
          const typeSubjects = state.subjects.filter(s => s.type === type);
          const otherSubjects = state.subjects.filter(s => s.type !== type);
          
          typeSubjects.sort((a, b) => newOrderIds.indexOf(a.id) - newOrderIds.indexOf(b.id));
          
          state.subjects = [];
          ['study', 'training', 'inactive'].forEach(t => {
            if (t === type) state.subjects.push(...typeSubjects);
            else state.subjects.push(...otherSubjects.filter(s => s.type === t));
          });
          
          Store.save(state);
        }
      });
    });
  }
}

// ===== MODALS =====
function populateSubjectSelect() {
  const sel = $('#inputSubject');
  const typeOrder = ['study', 'training', 'inactive'];
  sel.innerHTML = typeOrder.map(type => {
    const cfg = TYPES[type];
    const items = state.subjects.filter(s => s.type === type);
    if (items.length === 0) return '';
    return `<optgroup label="${DS.escapeHtml(I18n.t(cfg.i18nKey))}">${items.map(s =>
      `<option value="${s.id}">${DS.escapeHtml(s.name)}</option>`
    ).join('')}</optgroup>`;
  }).join('');
}

function openBlockModal(blockId = null) {
  editingBlockId = blockId;
  populateSubjectSelect();

  if (blockId) {
    const block = state.blocks.find(b => b.id === blockId);
    if (!block) return;
    $('#modalTitle').textContent = I18n.t('block.edit');
    $('#inputSubject').value = block.subjectId;
    $('#inputTopic').value = block.topic || '';
    $('#inputStart').value = block.start;
    $('#inputEnd').value = block.end;
    $('#btnDeleteBlock').classList.remove('hidden');
  } else {
    $('#modalTitle').textContent = I18n.t('block.new');
    $('#inputTopic').value = '';
    $('#inputStart').value = '08:00';
    $('#inputEnd').value = '09:00';
    $('#btnDeleteBlock').classList.add('hidden');
    if (state.subjects.length > 0) $('#inputSubject').value = state.subjects[0].id;
  }

  DS.sheet.open($('#modalBlock'), 0.92);
}

function closeBlockModal() { DS.sheet.close($('#modalBlock')); editingBlockId = null; }

let subjectModalType = 'study';
let currentEditingSubjectId = null;
let modalSlots = [];
let modalContentItems = [];

function renderModalSlots(slots = []) {
  modalSlots = [...slots];
  const listEl = $('#profileSlotsList');
  const days = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, i).toLocaleDateString(I18n.locale, { weekday: 'narrow' }));

  const render = () => {
    listEl.innerHTML = modalSlots.map((slot, index) => {
      const activeDays = slot.daysOfWeek || (slot.dayOfWeek !== undefined ? [slot.dayOfWeek] : []);
      const daysHTML = days.map((d, dIdx) => `
        <label class="day-chip ${activeDays.includes(dIdx) ? 'active' : ''}">
          <input type="checkbox" class="slot-day-chk" data-index="${index}" value="${dIdx}" ${activeDays.includes(dIdx) ? 'checked' : ''}>
          ${d}
        </label>
      `).join('');

      return `
        <div class="slot-card">
          <div class="slot-card-row">
            <div class="slot-days">${daysHTML}</div>
            <button type="button" class="ds-btn ds-btn-plain btn-remove-slot" data-index="${index}" aria-label="Remove">
              ${DS.icon('x', { size: 16 })}
            </button>
          </div>
          <div class="slot-card-row">
            <input type="time" class="slot-time-input slot-start" data-index="${index}" value="${slot.start}">
            <span class="slot-time-sep">—</span>
            <input type="time" class="slot-time-input slot-end" data-index="${index}" value="${slot.end}">
          </div>
        </div>
      `;
    }).join('');
    
    listEl.querySelectorAll('.slot-day-chk').forEach(chk => {
      chk.addEventListener('change', () => {
        const idx = parseInt(chk.dataset.index);
        const dayVal = parseInt(chk.value);
        const chip = chk.closest('.day-chip');
        if (!modalSlots[idx].daysOfWeek) {
          modalSlots[idx].daysOfWeek = modalSlots[idx].dayOfWeek !== undefined ? [modalSlots[idx].dayOfWeek] : [];
        }
        if (chk.checked) {
          if (!modalSlots[idx].daysOfWeek.includes(dayVal)) modalSlots[idx].daysOfWeek.push(dayVal);
          chip?.classList.add('active');
        } else {
          modalSlots[idx].daysOfWeek = modalSlots[idx].daysOfWeek.filter(d => d !== dayVal);
          chip?.classList.remove('active');
        }
      });
    });
    
    listEl.querySelectorAll('.slot-start').forEach(input => {
      input.addEventListener('change', () => {
        modalSlots[parseInt(input.dataset.index)].start = input.value;
      });
    });
    
    listEl.querySelectorAll('.slot-end').forEach(input => {
      input.addEventListener('change', () => {
        modalSlots[parseInt(input.dataset.index)].end = input.value;
      });
    });
    
    listEl.querySelectorAll('.btn-remove-slot').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ok = await DS.confirm(I18n.t('slot.remove_title'), I18n.t('slot.remove_msg'), I18n.t('slot.remove_btn'));
        if (ok) {
          modalSlots.splice(parseInt(btn.dataset.index), 1);
          render();
        }
      });
    });
  };
  
  render();
}

function renderModalContentList(items = [], type = 'study') {
  modalContentItems = [...items];
  const listEl = $('#profileContentList');
  
  const render = () => {
    if (modalContentItems.length === 0) {
      listEl.innerHTML = `<p class="content-none">${I18n.t('content.none')}</p>`;
      return;
    }
    
    listEl.innerHTML = modalContentItems.map((item, index) => {
      let desc = '';
      if (type === 'study') {
        const isRep = item.unit === 'rep';
        const amt = item.duration ? item.duration + ' ' + (isRep ? I18n.t('content.duration_reps') : I18n.t('content.duration_min')) : '';
        desc = `<span>${DS.escapeHtml(item.topic)}</span> <span class="content-meta">${amt}</span>`;
      } else if (type === 'training') {
        desc = `<div><strong>${DS.escapeHtml(item.name)}</strong> <span class="content-meta">${item.sets}x${item.reps} (${item.weight})</span></div>`;
      } else {
        desc = `<span>${DS.escapeHtml(item.task)}</span>`;
      }
      
      return `
        <div class="ds-list-item content-item-row" data-id="${item.id}">
          <div class="drag-handle" style="cursor: grab; margin-right: 8px; color: var(--ds-text-tertiary); display:flex; align-items:center;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </div>
          <div style="flex:1; min-width:0; font-size:13px;">${desc}</div>
          <button type="button" class="ds-btn ds-btn-plain btn-remove-content remove-content-btn" data-index="${index}">
            ${DS.icon('x', { size: 16 })}
          </button>
        </div>
      `;
    }).join('');
    
    listEl.querySelectorAll('.btn-remove-content').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ok = await DS.confirm(I18n.t('content.remove_title'), I18n.t('content.remove_msg'), I18n.t('content.remove_btn'));
        if (ok) {
          modalContentItems.splice(parseInt(btn.dataset.index), 1);
          render();
        }
      });
    });

    if (window.Sortable) {
      new Sortable(listEl, {
        handle: '.drag-handle',
        animation: 150,
        ghostClass: 'sortable-ghost',
        onEnd: function (evt) {
          const movedItem = modalContentItems.splice(evt.oldIndex, 1)[0];
          modalContentItems.splice(evt.newIndex, 0, movedItem);
          // Update data-index on buttons without full re-render to keep smooth feel
          listEl.querySelectorAll('.btn-remove-content').forEach((btn, idx) => {
            btn.dataset.index = idx;
          });
        }
      });
    }
  };
  
  render();
}

function openSubjectModal(type = 'study', subjectId = null) {
  subjectModalType = type;
  currentEditingSubjectId = subjectId;
  const cfg = TYPES[type];
  
  const typeSelect = $('#inputSubjectType');
  typeSelect.value = type;
  typeSelect.disabled = !!subjectId;
  typeSelect.dispatchEvent(new Event('change'));
  
  // Disable segment buttons if editing
  document.querySelectorAll('#subjectTypeSegments .ds-segment-btn').forEach(btn => {
    btn.disabled = !!subjectId;
    btn.style.opacity = !!subjectId ? '0.5' : '1';
    btn.style.cursor = !!subjectId ? 'not-allowed' : 'pointer';
  });
  
  $('#formAddSyllabus').classList.toggle('hidden', type !== 'study');
  $('#formAddExercise').classList.toggle('hidden', type !== 'training');
  $('#formAddRoutineTask').classList.toggle('hidden', type !== 'inactive');
  
  let slots = [];
  let databaseItems = [];
  
  if (subjectId) {
    const subj = state.subjects.find(s => s.id === subjectId);
    if (subj) {
      $('#modalSubjectTitle').textContent = I18n.t('subject.edit_profile', { label: I18n.t(cfg.i18nKey) });
      $('#inputSubjectName').value = subj.name;
      setColorPicker('#subjectColorPicker', subj.color);
      slots = subj.slots || [];
      databaseItems = subj.type === 'study' ? (subj.syllabus || []) : 
                      (subj.type === 'training' ? (subj.exercises || []) : (subj.checklist || []));
    }
  } else {
    $('#modalSubjectTitle').textContent = I18n.t('subject.new_profile', { label: I18n.t(cfg.i18nKey) });
    $('#inputSubjectName').value = '';
    setColorPicker('#subjectColorPicker', '#007aff');
  }
  
  renderModalSlots(slots);
  renderModalContentList(databaseItems, type);
  DS.sheet.open($('#modalSubject'), 0.92);
}

function closeSubjectModal() { DS.sheet.close($('#modalSubject')); currentEditingSubjectId = null; }


// ===== PRIORITIES CIRCLE =====
function getZoneListEl(zoneId) {
  return document.getElementById(zoneId === 'unallocated' ? 'listUnallocated' : 'list' + zoneId.charAt(0).toUpperCase() + zoneId.slice(1));
}
function getZoneKey(dataZone) {
  return dataZone === 'unallocated' ? 'unallocated' : `zone${dataZone}`;
}

function updatePriorityCounts() {
  const p = state.priorities;
  if (!p) return;
  ['zone1','zone2','zone3','unallocated'].forEach(zoneId => {
    const countEl = document.getElementById(zoneId === 'unallocated' ? 'countUnallocated' : 'count' + zoneId.charAt(0).toUpperCase() + zoneId.slice(1));
    if (countEl) {
      countEl.textContent = zoneId === 'zone1' ? `${p[zoneId].length}/3` : p[zoneId].length;
    }
  });
}

function renderPriorities() {
  const p = state.priorities;
  if (!p) return;

  ['zone1','zone2','zone3','unallocated'].forEach(zoneId => {
    const listEl = getZoneListEl(zoneId);
    if (!listEl) return;

    listEl.innerHTML = p[zoneId].map(item => `
      <div class="priority-item" data-id="${item.id}" data-pillar="${item.pillar}">
        <div class="priority-item-dot" style="background:${item.color}"></div>
        ${DS.escapeHtml(item.name)}
      </div>
    `).join('');
  });
  updatePriorityCounts();
}

function syncPrioritiesFromDOM() {
  const allItems = {};
  ['zone1','zone2','zone3','unallocated'].forEach(zk => {
    (state.priorities[zk] || []).forEach(item => { allItems[item.id] = item; });
  });

  ['zone1','zone2','zone3','unallocated'].forEach(zoneId => {
    const listEl = getZoneListEl(zoneId);
    if (!listEl) return;
    state.priorities[zoneId] = [];
    listEl.querySelectorAll('.priority-item:not(.sortable-ghost):not(.sortable-drag)').forEach(el => {
      const item = allItems[el.dataset.id];
      if (item) state.priorities[zoneId].push(item);
    });
  });
}

function initPriorities() {
  if (!window.Sortable) { console.warn('[Priorities] Sortable not loaded'); return; }

  renderPriorities();

  const lists = ['zone1','zone2','zone3','unallocated'].map(zoneId => {
    const listEl = getZoneListEl(zoneId);
    if (!listEl) return null;
    if (listEl._sortable) { listEl._sortable.destroy(); listEl._sortable = null; }
    return listEl;
  }).filter(Boolean);

  lists.forEach(listEl => {
    listEl._sortable = new Sortable(listEl, {
      group: 'priorities',
      animation: 150,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag',
      forceFallback: true,
      fallbackOnBody: true,
      swapThreshold: 0.65,
      onMove: (evt) => {
        // Block drops into zone1 if already at max 3 (excluding ghost/dragged item)
        const toZone = evt.to.dataset.zone;
        if (toZone === '1') {
          const count = evt.to.querySelectorAll('.priority-item:not(.sortable-ghost):not(.sortable-drag)').length;
          if (count >= 3 && evt.from !== evt.to) {
            return false; // cancel the move
          }
        }
        return true;
      },
      onEnd: (evt) => {
        const fromZone = evt.from.dataset.zone;
        const toZone = evt.to.dataset.zone;
        if (fromZone === toZone && evt.oldIndex === evt.newIndex) return;

        syncPrioritiesFromDOM();
        updatePriorityCounts();
        Store.save(state);
      }
    });
  });
}

// Color picker
function setColorPicker(containerSel, color) {
  document.querySelectorAll(`${containerSel} .color-dot`).forEach(d => {
    d.classList.toggle('active', d.dataset.color === color);
  });
}
function getSelectedColor(containerSel) {
  return document.querySelector(`${containerSel} .color-dot.active`)?.dataset.color || '#007aff';
}
function initColorPickers() {
  document.querySelectorAll('.color-dot').forEach(dot => {
    dot.addEventListener('click', () => setColorPicker(`#${dot.closest('div').id}`, dot.dataset.color));
  });
}

// ===== SAVE / DELETE =====
function saveBlock() {
  const subjectId = $('#inputSubject').value;
  const topic = $('#inputTopic').value.trim();
  const start = $('#inputStart').value;
  const end = $('#inputEnd').value;

  if (!subjectId) { DS.toast(I18n.t('alert.select_subject'), 'warning'); return; }
  if (!start || !end) { DS.toast(I18n.t('alert.set_time'), 'warning'); return; }
  if (start === end) { DS.toast(I18n.t('alert.end_after_start'), 'warning'); return; }

  const subj = state.subjects.find(s => s.id === subjectId);

  const isEditing = !!editingBlockId;
  if (isEditing) {
    const block = state.blocks.find(b => b.id === editingBlockId);
    if (block) { block.subjectId = subjectId; block.topic = topic; block.start = start; block.end = end; }
    logAction(I18n.t('log.edited_block', { name: topic || subj?.name, start, end }));
  } else {
    state.blocks.push({
      id: uid(), date: dateKey(selectedDate),
      subjectId, topic, start, end, done: false,
    });
    logAction(I18n.t('log.created_block', { name: topic || subj?.name, start, end }));
  }

  Store.save(state);
  closeBlockModal();
  render();
  DS.toast(isEditing ? I18n.t('block.updated') : I18n.t('block.created'), 'success');
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  // Handles overnight ranges (e.g. 21:00-06:00)
  const a1 = timeToMinutes(aStart), a2 = timeToMinutes(aEnd);
  const b1 = timeToMinutes(bStart), b2 = timeToMinutes(bEnd);
  const aOvernight = a2 <= a1;
  const bOvernight = b2 <= b1;

  if (!aOvernight && !bOvernight) return a1 < b2 && a2 > b1;
  if (aOvernight && !bOvernight) return b1 < a2 || b2 > a1;
  if (!aOvernight && bOvernight) return a1 < b2 || a2 > b1;
  return true; // both overnight always overlap
}

function checkScheduleOverlap(slots, subjectId) {
  for (let i = 0; i < slots.length; i++) {
    const s1 = slots[i];
    const days1 = s1.daysOfWeek || (s1.dayOfWeek !== undefined ? [s1.dayOfWeek] : []);
    if (s1.start === s1.end) {
      DS.toast(I18n.t('alert.invalid_time', { start: s1.start, end: s1.end }), 'error');
      return true;
    }
    if (days1.length === 0) {
      DS.toast(I18n.t('alert.select_day', { start: s1.start, end: s1.end }), 'error');
      return true;
    }

    for (let j = i + 1; j < slots.length; j++) {
      const s2 = slots[j];
      const days2 = s2.daysOfWeek || (s2.dayOfWeek !== undefined ? [s2.dayOfWeek] : []);
      const overlapDays = days1.filter(d => days2.includes(d));
      if (overlapDays.length > 0 && rangesOverlap(s1.start, s1.end, s2.start, s2.end)) {
        DS.toast(I18n.t('alert.conflict_internal'), 'error');
        return true;
      }
    }

    for (const other of state.subjects) {
      if (other.id === subjectId) continue;
      for (const oSlot of (other.slots || [])) {
        const oDays = oSlot.daysOfWeek || (oSlot.dayOfWeek !== undefined ? [oSlot.dayOfWeek] : []);
        const overlapDays = days1.filter(d => oDays.includes(d));
        if (overlapDays.length > 0 && rangesOverlap(s1.start, s1.end, oSlot.start, oSlot.end)) {
          DS.toast(I18n.t('alert.conflict_subject', { name: other.name }), 'error');
          return true;
        }
      }
    }
  }
  return false;
}

function saveSubject() {
  const name = $('#inputSubjectName').value.trim();
  const color = getSelectedColor('#subjectColorPicker');
  if (!name) { DS.toast(I18n.t('alert.enter_name'), 'warning'); return; }
  if (name.length > MAX_SUBJECT_NAME_LENGTH) { DS.toast(I18n.t('alert.name_too_long'), 'warning'); return; }

  const duplicate = state.subjects.find(s => s.name.toLowerCase() === name.toLowerCase() && s.id !== currentEditingSubjectId);
  if (duplicate) { DS.toast(I18n.t('alert.duplicate_name'), 'warning'); return; }
  
  if (checkScheduleOverlap(modalSlots, currentEditingSubjectId)) {
    return;
  }
  
  if (currentEditingSubjectId) {
    const subj = state.subjects.find(s => s.id === currentEditingSubjectId);
    if (subj) {
      subj.name = name;
      subj.color = color;
      subj.slots = modalSlots;
      if (subjectModalType === 'study') subj.syllabus = modalContentItems;
      else if (subjectModalType === 'training') subj.exercises = modalContentItems;
      else subj.checklist = modalContentItems;
      logAction(I18n.t('log.edited_profile', { name }));
    }
  } else {
    const newSubj = {
      id: uid(),
      name,
      color,
      type: subjectModalType,
      slots: modalSlots
    };
    if (subjectModalType === 'study') newSubj.syllabus = modalContentItems;
    else if (subjectModalType === 'training') newSubj.exercises = modalContentItems;
    else newSubj.checklist = modalContentItems;
    
    state.subjects.push(newSubj);
    logAction(I18n.t('log.created_profile', { name }));
  }
  
  Store.save(state);
  closeSubjectModal();
  renderSubjects();
  render();
  DS.toast(I18n.t('subject.saved', { name }), 'success');
}

async function deleteBlock() {
  if (!editingBlockId) return;
  const ok = await DS.confirm(I18n.t('block.delete'), I18n.t('block.delete_msg'), I18n.t('confirm.delete'));
  if (ok) {
    const block = state.blocks.find(b => b.id === editingBlockId);
    if (block) {
      logAction(I18n.t('log.deleted_block', { start: block.start, end: block.end }));
    }
    state.blocks = state.blocks.filter(b => b.id !== editingBlockId);
    Store.save(state);
    closeBlockModal();
    render();
  }
}

// ===== TABS =====
function initTabs() {
  const pages = {
    schedule: { show: ['#pizzaPage', '#weekNav'], hide: ['#pageSubjects', '#pageSettings'] },
    subjects: { show: ['#pageSubjects'], hide: ['#pizzaPage', '#weekNav', '#pageSettings'] },
    settings: { show: ['#pageSettings'], hide: ['#pizzaPage', '#weekNav', '#pageSubjects'] },
  };

  function switchTab(tabName, animate) {
    $$('.ds-tab').forEach(t => t.classList.remove('active'));
    const activeTab = [...$$('.ds-tab')].find(t => t.dataset.tab === tabName);
    if (activeTab) activeTab.classList.add('active');
    const p = pages[tabName];
    if (!p) return;
    p.show.forEach(s => {
      const el = $(s);
      if (el) {
        el.classList.remove('hidden');
        if (animate) { el.classList.add('page-enter'); el.addEventListener('animationend', () => el.classList.remove('page-enter'), { once: true }); }
      }
    });
    p.hide.forEach(s => { const el = $(s); if (el) el.classList.add('hidden'); });
    if (tabName === 'subjects') renderSubjects();
    if (tabName === 'settings' && typeof initPriorities === 'function') initPriorities();
    try { localStorage.setItem('studyplan_tab', tabName); } catch(e) {}
  }

  $$('.ds-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab, true));
  });

  // Restore last active tab
  const saved = localStorage.getItem('studyplan_tab');
  if (saved && pages[saved]) {
    switchTab(saved, false);
  }
}

// ===== SETTINGS =====
function updateClock() {
  const tz = state.settings.timezone || 'America/Sao_Paulo';
  const now = new Date();
  $('#headerClock').textContent = now.toLocaleTimeString(I18n.locale, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz });
  updateBlockProgress();
}

function updateBlockProgress() {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayKey = dateKey(new Date());

  document.querySelectorAll('.block-card').forEach(card => {
    const id = card.dataset.id;
    const block = state.blocks.find(b => b.id === id);
    if (!block || block.date !== todayKey) {
      card.style.setProperty('--block-progress', '0');
      return;
    }
    if (block.done) {
      card.style.setProperty('--block-progress', '1');
      return;
    }
    const startMin = timeToMinutes(block.start);
    const endMin = timeToMinutes(block.end);
    const duration = endMin > startMin ? endMin - startMin : (1440 - startMin + endMin);
    const elapsed = endMin > startMin
      ? nowMin - startMin
      : (nowMin >= startMin ? nowMin - startMin : 1440 - startMin + nowMin);

    if (elapsed <= 0) {
      card.style.setProperty('--block-progress', '0');
    } else if (elapsed >= duration) {
      card.style.setProperty('--block-progress', '1');
    } else {
      card.style.setProperty('--block-progress', (elapsed / duration).toFixed(4));
    }
  });
}

function initSettings() {
  const themeSelect = $('#themeSelect');
  const notifToggle = $('#toggleNotif');
  const reminderSelect = $('#reminderTime');
  const marqueeToggle = $('#toggleShowMarquee');

  if (themeSelect) themeSelect.value = state.settings.theme;
  if (notifToggle) notifToggle.checked = state.settings.notifications;
  if (reminderSelect) reminderSelect.value = state.settings.reminderMin;
  if (marqueeToggle) marqueeToggle.checked = state.settings.showMarquee !== false;

  applyTheme(state.settings.theme);
  updateMarqueeVisibility();

  if (themeSelect) {
    themeSelect.addEventListener('change', () => {
      state.settings.theme = themeSelect.value;
      applyTheme(themeSelect.value);
      Store.save(state);
      logAction(I18n.t('log.changed_theme', { theme: themeSelect.value }));
    });
  }

  if (notifToggle) {
    notifToggle.addEventListener('change', () => {
      state.settings.notifications = notifToggle.checked;
      if (notifToggle.checked && 'Notification' in window) {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            DS.toast(I18n.t('settings.notif_on'), 'success');
          } else {
            DS.toast(I18n.t('settings.notif_denied'), 'warning');
          }
        });
      }
      Store.save(state);
      logAction(I18n.t(notifToggle.checked ? 'log.notif_on' : 'log.notif_off'));
    });
  }

  if (reminderSelect) {
    reminderSelect.addEventListener('change', () => {
      state.settings.reminderMin = parseInt(reminderSelect.value);
      Store.save(state);
      logAction(I18n.t('log.changed_reminder', { min: reminderSelect.value }));
    });
  }

  const tzSelect = $('#timezoneSelect');
  if (tzSelect) {
    tzSelect.value = state.settings.timezone || 'America/Sao_Paulo';
    tzSelect.addEventListener('change', () => {
      state.settings.timezone = tzSelect.value;
      Store.save(state);
      updateClock();
    });
  }

  const langSelect = $('#langSelect');
  if (langSelect) {
    langSelect.value = I18n.locale;
    langSelect.addEventListener('change', async () => {
      await I18n.setLocale(langSelect.value);
      logAction(I18n.t('log.changed_lang', { lang: langSelect.value }));
    });
  }

  const $btnTestNotif = $('#btnTestNotif');
  if ($btnTestNotif) $btnTestNotif.addEventListener('click', async () => {
    try {
      if ('Notification' in window && Notification.permission !== 'granted') {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
          DS.toast(I18n.t('settings.notif_denied'), 'warning');
          return;
        }
      }
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        
        // Generate test icon
        const encColor = encodeURIComponent('#007aff');
        const testIcon = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="${encColor}" opacity="0.15"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" fill="none" stroke="${encColor}" stroke-width="2" stroke-linecap="round"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" fill="none" stroke="${encColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
        
        const title = `📚 ${I18n.t('notification.title')}`;
        await reg.showNotification(title, {
          body: I18n.t('settings.test_notif_body'),
          icon: testIcon,
          badge: testIcon,
          vibrate: [200, 100, 200, 100, 200],
          tag: 'test-notif',
        });
      } else if ('Notification' in window) {
        new Notification(`📚 ${I18n.t('notification.title')}`, { body: I18n.t('settings.test_notif_body') });
      }
      logAction(I18n.t('log.test_notification'));
      DS.toast(I18n.t('settings.test_notif'), 'success');
    } catch (err) {
      console.error('Test notification error:', err);
    }
  });

  // PWA Install button
  const btnInstall = $('#btnInstallPwa');
  if (btnInstall) {
    // Show install section if not already installed as standalone
    if (!isStandalone()) {
      const section = $('#installPwaSection');
      if (section) section.classList.remove('hidden');
    }

    btnInstall.addEventListener('click', async () => {
      if (deferredInstallPrompt) {
        // Android/Chrome — native prompt
        deferredInstallPrompt.prompt();
        const result = await deferredInstallPrompt.userChoice;
        if (result.outcome === 'accepted') {
          DS.toast(I18n.t('settings.app_installed') || 'App instalado!', 'success');
        }
        deferredInstallPrompt = null;
        const section = $('#installPwaSection');
        if (section) section.classList.add('hidden');
      } else {
        // iOS Safari or browser without beforeinstallprompt — show step-by-step
        const steps = $('#pwaIosSteps');
        if (steps) {
          steps.classList.toggle('hidden');
          btnInstall.textContent = steps.classList.contains('hidden') ? I18n.t('pwa.install_btn') : I18n.t('common.close');
        }
      }
    });
  }

  const $btnClearLogs = $('#btnClearLogs');
  if ($btnClearLogs) {
    $btnClearLogs.addEventListener('click', () => {
      state.logs = [];
      Store.save(state);
      renderLogs();
      logAction(I18n.t('log.cleared_logs'));
    });
  }

  const btnLogout = $('#btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      const ok = await DS.confirm(
        I18n.t('auth.logout_confirm_title') || 'Sair',
        I18n.t('auth.logout_confirm_msg') || 'Deseja realmente sair?',
        I18n.t('auth.logout') || 'Sair',
        { style: 'primary' }
      );
      if (ok) {
        AuthService.logout();
        document.documentElement.classList.remove('authenticated');
        $('#app').style.display = 'none';
        $('#authScreen').style.display = 'flex';
        $('#inputAuthEmail').value = '';
        $('#inputAuthPassword').value = '';
        DS.toast(I18n.t('auth.logged_out') || 'Sessão encerrada', 'info');
      }
    });
  }

  const $btnClearData = $('#btnClearData');
  if ($btnClearData) {
    $btnClearData.addEventListener('click', async () => {
      const ok = await DS.confirm(I18n.t('settings.clear_title'), I18n.t('settings.clear_msg'));
      if (ok) {
        localStorage.removeItem(Store._key);
        state = Store.load();
        render();
        logAction(I18n.t('log.cleared_data'));
      }
    });
  }

  // MCP Config Generator
  const $btnGenMcp = $('#btnGenMcpConfig');
  if ($btnGenMcp) {
    function getMcpTokens() {
      return {
        access: Supabase._accessToken || '',
        refresh: Supabase._refreshToken || ''
      };
    }

    function buildCliCommand(tokens) {
      return `claude mcp add taketime -e TAKETIME_ACCESS_TOKEN=${tokens.access} -e TAKETIME_REFRESH_TOKEN=${tokens.refresh} -- npx -y @taketime/mcp-server`;
    }

    function buildJsonConfig(wrapKey, tokens) {
      const obj = { [wrapKey]: { taketime: { command: 'npx', args: ['-y', '@taketime/mcp-server'], env: { TAKETIME_ACCESS_TOKEN: tokens.access, TAKETIME_REFRESH_TOKEN: tokens.refresh } } } };
      return JSON.stringify(obj, null, 2);
    }

    const mcpClients = [
      { id: 'claude-code', name: 'Claude Code', icon: '⌨️', type: 'cli', path: 'Terminal' },
      { id: 'claude-desktop', name: 'Claude Desktop', icon: '🖥️', type: 'json', wrap: 'mcpServers', path: '~/Library/Application Support/Claude/claude_desktop_config.json' },
      { id: 'cursor', name: 'Cursor', icon: '📝', type: 'json', wrap: 'mcpServers', path: '.cursor/mcp.json' },
      { id: 'vscode', name: 'VS Code', icon: '💻', type: 'json', wrap: 'servers', path: '.vscode/mcp.json' },
      { id: 'windsurf', name: 'Windsurf', icon: '🏄', type: 'json', wrap: 'mcpServers', path: '~/.codeium/windsurf/mcp_config.json' },
    ];

    function renderMcpCards() {
      const tokens = getMcpTokens();
      const container = $('#mcpClientCards');
      if (!container) return;
      container.innerHTML = '';

      if (!tokens.access || !tokens.refresh) {
        container.innerHTML = '<p style="font-size:13px; color:var(--ds-text-tertiary); text-align:center; padding:20px 0;" data-i18n="mcp.no_session">Faça login para gerar os comandos.</p>';
        return;
      }

      mcpClients.forEach(client => {
        const command = client.type === 'cli'
          ? buildCliCommand(tokens)
          : buildJsonConfig(client.wrap, tokens);

        const card = document.createElement('div');
        card.style.cssText = 'background:var(--ds-bg-card); border-radius:var(--ds-radius-md); padding:12px; box-shadow:var(--ds-shadow-sm);';
        card.innerHTML = `
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
            <span style="font-size:14px; font-weight:600; color:var(--ds-text-primary);">${client.icon} ${client.name}</span>
            <span style="font-size:11px; color:var(--ds-text-tertiary);">${client.type === 'cli' ? 'Terminal' : client.path}</span>
          </div>
          <div style="position:relative;">
            <pre style="background:var(--ds-bg-secondary); padding:10px; padding-right:60px; border-radius:var(--ds-radius-sm); font-size:11px; line-height:1.4; overflow-x:auto; white-space:pre; font-family:'SF Mono',Menlo,monospace; color:var(--ds-text-primary); border:1px solid var(--ds-separator); max-height:120px;">${command.replace(/</g, '&lt;')}</pre>
            <button class="ds-btn ds-btn-tinted mcp-copy-btn" style="position:absolute; top:8px; right:8px; font-size:11px; padding:4px 10px;">${I18n.t('mcp.copy')}</button>
          </div>`;

        card.querySelector('.mcp-copy-btn').addEventListener('click', function() {
          navigator.clipboard.writeText(command).then(() => {
            this.textContent = I18n.t('mcp.copied');
            setTimeout(() => { this.textContent = I18n.t('mcp.copy'); }, 2000);
          });
        });

        container.appendChild(card);
      });
    }

    $btnGenMcp.addEventListener('click', () => {
      renderMcpCards();
      DS.sheet.open(document.getElementById('modalMcpConfig'));
    });
  }


  // Marquee custom texts
  const $marqueeTA = $('#marqueeTextarea');
  const $btnSaveMarquee = $('#btnSaveMarquee');
  const $btnResetMarquee = $('#btnResetMarquee');

  if ($marqueeTA) {
    const texts = (state.settings.marqueeTexts && state.settings.marqueeTexts.length > 0)
      ? state.settings.marqueeTexts
      : DEFAULT_VERSES;
    $marqueeTA.value = texts.join('\n');
  }

  if ($btnSaveMarquee) {
    $btnSaveMarquee.addEventListener('click', () => {
      const lines = $marqueeTA.value.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length === 0) {
        DS.toast(I18n.t('marquee.error_empty'), 'warning');
        return;
      }
      state.settings.marqueeTexts = lines;
      Store.save(state);
      initVerseMarquee();
      DS.toast(I18n.t('marquee.saved'), 'success');
    });
  }

  if ($btnResetMarquee) {
    $btnResetMarquee.addEventListener('click', () => {
      delete state.settings.marqueeTexts;
      Store.save(state);
      $marqueeTA.value = DEFAULT_VERSES.join('\n');
      initVerseMarquee();
      DS.toast(I18n.t('marquee.reset_done'), 'info');
    });
  }

  // Toggle motivational marquee listener
  if (marqueeToggle) {
    marqueeToggle.addEventListener('change', () => {
      state.settings.showMarquee = marqueeToggle.checked;
      updateMarqueeVisibility();
      Store.save(state);
    });
  }
}

function updateMarqueeVisibility() {
  const marquee = $('#verseMarquee');
  if (marquee) {
    const show = state.settings.showMarquee !== false;
    marquee.classList.toggle('hidden', !show);
  }
}

function applyTheme(theme) {
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
  // Update meta theme-color to match current effective theme
  updateThemeColor();
}

function updateThemeColor() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
    (!document.documentElement.getAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const color = isDark ? '#0a0a0c' : '#f2f2f7';
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', color));
}

// ===== DAILY BLOCKS GENERATOR FROM WEEKLY SLOTS =====
function initDailyBlocksFromProfiles(date) {
  const dKey = dateKey(date);
  const dayOfWeek = date.getDay(); // 0 is Sunday, 1 is Monday...

  const newBlocks = [];
  state.subjects.forEach(profile => {
    // Apenas pula se ESSA matéria específica já tem bloco hoje,
    // garantindo que novas matérias criadas hoje entrem na pizza!
    const profileExistsToday = state.blocks.some(b => b.date === dKey && b.subjectId === profile.id);
    if (profileExistsToday) return;

    const slots = profile.slots || [];
    slots.forEach(slot => {
      const slotDays = slot.daysOfWeek || (slot.dayOfWeek !== undefined ? [slot.dayOfWeek] : []);
      if (slotDays.includes(dayOfWeek)) {
        let selectedId = null;
        if (profile.type === 'study' && profile.syllabus) {
          const nextPending = profile.syllabus.find(item => item.status === 'pending');
          if (nextPending) selectedId = nextPending.id;
        }

        newBlocks.push({
          id: uid(),
          date: dKey,
          subjectId: profile.id,
          topic: '',
          start: slot.start,
          end: slot.end,
          done: false,
          selectedSyllabusId: selectedId,
          completedItems: []
        });
      }
    });
  });

  if (newBlocks.length > 0) {
    newBlocks.sort((a, b) => a.start.localeCompare(b.start));
    state.blocks.push(...newBlocks);
  }
}

// ===== INFOS & HEATMAP =====
window.showStudyTipsInfo = function() {
  const title = document.getElementById('modalInfoTitle');
  const body = document.getElementById('modalInfoBody');
  const modal = document.getElementById('modalInfo');
  
  if (!title || !body || !modal) return;
  
  title.textContent = I18n.t('info.smart_schedule_title');
  body.innerHTML = `
    <p style="margin-bottom: 12px; text-align: left; font-weight: 600;">${I18n.t('info.smart_schedule_intro')}</p>
    <ul style="text-align: left; margin-left: 20px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 8px;">
      <li>${I18n.t('info.smart_schedule_tip1')}</li>
      <li>${I18n.t('info.smart_schedule_tip2')}</li>
      <li>${I18n.t('info.smart_schedule_tip3')}</li>
      <li>${I18n.t('info.smart_schedule_tip4')}</li>
    </ul>
  `;
  
  DS.sheet.open(modal, 0.65);
}

window.showHeatmapInfo = function() {
  const title = document.getElementById('modalInfoTitle');
  const body = document.getElementById('modalInfoBody');
  const modal = document.getElementById('modalInfo');
  
  if (!title || !body || !modal) return;
  
  title.textContent = I18n.t('info.heatmap_title');
  body.innerHTML = `
    <p style="margin-bottom: 12px; text-align: left;">${I18n.t('info.heatmap_intro')}</p>
    <ul style="text-align: left; margin-left: 20px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 8px;">
      <li>${I18n.t('info.heatmap_item1')}</li>
      <li>${I18n.t('info.heatmap_item2')}</li>
      <li>${I18n.t('info.heatmap_item3')}</li>
    </ul>
    <p style="text-align: left; font-weight: 600; color: var(--ds-text-primary);">${I18n.t('info.heatmap_footer')}</p>
  `;
  
  DS.sheet.open(modal, 0.5);
}

window.showPrioritiesInfo = function() {
  const title = document.getElementById('modalInfoTitle');
  const body = document.getElementById('modalInfoBody');
  const modal = document.getElementById('modalInfo');
  if (!title || !body || !modal) return;
  title.textContent = I18n.t('info.priorities_title');
  body.innerHTML = `
    <p style="margin-bottom: 12px; text-align: left;">${I18n.t('info.priorities_intro')}</p>
    <ul style="text-align: left; margin-left: 20px; margin-bottom: 16px; display: flex; flex-direction: column; gap: 8px;">
      <li>${I18n.t('info.priorities_focus')}</li>
      <li>${I18n.t('info.priorities_important')}</li>
      <li>${I18n.t('info.priorities_flexible')}</li>
    </ul>
    <p style="text-align: left; font-weight: 600; color: var(--ds-text-primary);">${I18n.t('info.priorities_footer')}</p>
  `;
  DS.sheet.open(modal, 0.55);
}

// ===== HEATMAP =====
function renderHeatmap() {
  const track = $('#heatmapTrack');
  const statsLabel = $('#heatmapStats');
  if (!track || !statsLabel) return;

  const dailyCounts = {};
  let totalCompleted = 0;
  state.blocks.forEach(b => {
    let count = 0;
    if (b.done) count++;
    if (b.completedItems && Array.isArray(b.completedItems)) count += b.completedItems.length;
    if (count > 0 && b.date) {
      if (!dailyCounts[b.date]) dailyCounts[b.date] = 0;
      dailyCounts[b.date] += count;
      totalCompleted += count;
    }
  });
  statsLabel.textContent = `${totalCompleted} ${I18n.t('heatmap.tasks')}`;

  function getLevel(count) {
    if (count === 0) return 0;
    if (count <= 2) return 1;
    if (count <= 5) return 2;
    if (count <= 8) return 3;
    return 4;
  }

  const today = new Date();
  const todayKey = dateKey(today);
  const year = today.getFullYear();
  const months = [];
  for (let m = 0; m < 12; m++) {
    months.push({ year, month: m });
  }

  const monthNames = Array.from({ length: 12 }, (_, i) => new Date(2024, i, 1).toLocaleDateString(I18n.locale, { month: 'short' }).replace('.', ''));
  const weekDays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, i).toLocaleDateString(I18n.locale, { weekday: 'narrow' }));

  track.innerHTML = months.map((m, idx) => {
    const firstDay = new Date(m.year, m.month, 1);
    const daysInMonth = new Date(m.year, m.month + 1, 0).getDate();
    const startDow = firstDay.getDay();
    let monthTasks = 0;

    const weekLabels = weekDays.map(d => `<span class="heatmap-weekday-label">${d}</span>`).join('');

    let cells = '';
    for (let e = 0; e < startDow; e++) {
      cells += '<div class="heatmap-cell heatmap-cell--empty"></div>';
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dStr = `${m.year}-${String(m.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const count = dailyCounts[dStr] || 0;
      monthTasks += count;
      const level = getLevel(count);
      const isToday = dStr === todayKey;
      cells += `<div class="heatmap-cell${isToday ? ' heatmap-cell--today' : ''}" data-level="${level}"></div>`;
    }

    const label = `${monthNames[m.month]}`;
    const statsText = `${monthTasks}`;

    return `<div class="heatmap-slide">
        <div class="heatmap-month-label">${label}</div>
        <div class="heatmap-month-stats">${statsText} ${I18n.t('heatmap.tasks')}</div>
        <div class="heatmap-weekday-labels">${weekLabels}</div>
        <div class="heatmap-month-grid">${cells}</div>
      </div>`;
  }).join('');

  // Scroll to current month
  requestAnimationFrame(() => {
    const currentIdx = today.getMonth();
    const slides = track.querySelectorAll('.heatmap-slide');
    if (slides[currentIdx]) {
      slides[currentIdx].scrollIntoView({ inline: 'center', block: 'nearest' });
    }
  });
}


// ===== MAIN RENDER =====
function render() {
  initDailyBlocksFromProfiles(selectedDate);
  $('#headerDate').textContent = formatFullDate(selectedDate);
  renderWeekNav();
  renderPizza();
  renderBlockList();
  renderHeatmap();
}

// iOS Safari detection — show manual install hint
const DEFAULT_VERSES = [
  'Lucas 1:37 \u2014 Pois nada \u00e9 imposs\u00edvel para Deus',
  'Ef\u00e9sios 3:20 \u2014 Infinitamente mais do que pedimos ou pensamos',
  'Filipenses 4:13 \u2014 Tudo posso naquele que me fortalece',
  'Josu\u00e9 1:9 \u2014 Seja forte e corajoso, o Senhor est\u00e1 contigo',
  'Jeremias 29:11 \u2014 Eu sei os planos que tenho para voc\u00ea',
  'Prov\u00e9rbios 16:3 \u2014 Confie ao Senhor tudo o que voc\u00ea faz',
  'Isa\u00edas 40:31 \u2014 Os que esperam no Senhor renovam suas for\u00e7as',
  'Salmos 37:5 \u2014 Entregue o seu caminho ao Senhor',
];

function initVerseMarquee() {
  const track = $('#verseTrack');
  if (!track) return;
  const verses = (state.settings.marqueeTexts && state.settings.marqueeTexts.length > 0)
    ? state.settings.marqueeTexts
    : DEFAULT_VERSES;
  // Build items: verse + dot, repeated 2x for seamless loop
  let html = '';
  for (let i = 0; i < 2; i++) {
    verses.forEach(v => {
      html += `<span>${DS.escapeHtml(v)}</span><i class="verse-dot" aria-hidden="true"></i>`;
    });
  }
  track.innerHTML = html;
}

function isIOSSafari() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !('beforeinstallprompt' in window);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

// ===== PULL-TO-REFRESH =====
function initPullToRefresh() {
  const THRESHOLD = 70;
  const MAX_PULL = 120;
  let startY = 0;
  let pulling = false;
  let dy = 0;

  // Persistent indicator in DOM
  const indicator = document.createElement('div');
  indicator.className = 'ptr-indicator';
  indicator.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--ds-color-primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`;
  document.body.appendChild(indicator);

  document.addEventListener('touchstart', (e) => {
    if (e.target.closest('.ds-overlay') || e.target.closest('.ds-sheet')) return;
    // Only activate when at very top of scroll
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    if (scrollTop > 2) return;
    startY = e.touches[0].clientY;
    pulling = true;
    dy = 0;
    indicator.style.transition = 'none';
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!pulling) return;

    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    dy = e.touches[0].clientY - startY;

    // If scrolling up or page scrolled, cancel
    if (dy < 0 || scrollTop > 2) {
      pulling = false;
      indicator.style.opacity = '0';
      return;
    }

    // Prevent page bounce while pulling
    if (dy > 10) {
      e.preventDefault();
    }

    const clamped = Math.min(dy, MAX_PULL);
    const progress = Math.min(clamped / THRESHOLD, 1);
    const translateY = clamped * 0.45 - 40;

    indicator.style.opacity = String(progress);
    indicator.style.transform = `translateX(-50%) translateY(${translateY}px) scale(${0.6 + progress * 0.4})`;
    indicator.querySelector('svg').style.transform = `rotate(${progress * 360}deg)`;
    indicator.classList.toggle('ptr-ready', dy >= THRESHOLD);
  }, { passive: false });

  document.addEventListener('touchend', () => {
    if (!pulling) return;
    pulling = false;

    if (dy >= THRESHOLD) {
      // Trigger reload
      indicator.classList.add('ptr-loading');
      indicator.style.transition = 'transform 0.3s ease';
      indicator.style.transform = 'translateX(-50%) translateY(20px) scale(1)';
      setTimeout(() => location.reload(), 500);
    } else {
      // Snap back
      indicator.style.transition = 'all 0.3s ease';
      indicator.style.transform = 'translateX(-50%) translateY(-40px) scale(0.5)';
      indicator.style.opacity = '0';
      indicator.classList.remove('ptr-ready');
    }
    dy = 0;
  });
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  // Restore Supabase session from localStorage
  const hasSession = Supabase.loadSession();
  if (hasSession && AuthService.isAuthenticated()) {
    document.documentElement.classList.add('authenticated');
    $('#authScreen').style.display = 'none';
    $('#app').style.display = 'block';
    // Sync data from cloud in background
    Store.syncOnLogin().then(synced => {
      if (synced) {
        state = synced;
        if (!state.logs) state.logs = [];
        if (!state.priorities) {
          state.priorities = Store._defaults().priorities;
        } else {
          ['zone1', 'zone2', 'zone3', 'unallocated'].forEach(k => {
            if (!state.priorities[k]) state.priorities[k] = [];
          });
        }
        state.subjects.forEach(s => { if (!s.type) s.type = 'study'; });
        render();
        renderSubjects();
        if (typeof initPriorities === 'function') initPriorities();
        if (typeof updateMarqueeVisibility === 'function') updateMarqueeVisibility();
      }
    }).catch(() => {});
  }

  await I18n.init();
  I18n.onChange(() => { render(); renderSubjects(); });

  initTabs();
  initColorPickers();
  initSettings();
  DS.sheet.init();
  initWeekSwipe();

  // Guarded DOM element bindings — if element is missing, skip silently
  const $btnPizzaAdd = $('#btnPizzaAdd');
  if ($btnPizzaAdd) $btnPizzaAdd.addEventListener('click', () => openBlockModal());

  const $modalCancel = $('#modalCancel');
  if ($modalCancel) $modalCancel.addEventListener('click', closeBlockModal);

  const $modalSave = $('#modalSave');
  if ($modalSave) $modalSave.addEventListener('click', saveBlock);

  const $btnDeleteBlock = $('#btnDeleteBlock');
  if ($btnDeleteBlock) $btnDeleteBlock.addEventListener('click', deleteBlock);

  const $modalSubjectCancel = $('#modalSubjectCancel');
  if ($modalSubjectCancel) $modalSubjectCancel.addEventListener('click', closeSubjectModal);

  const $modalSubjectSave = $('#modalSubjectSave');
  if ($modalSubjectSave) $modalSubjectSave.addEventListener('click', saveSubject);

  // Profile Slots and Content button bindings
  const $btnProfileAddSlot = $('#btnProfileAddSlot');
  if ($btnProfileAddSlot) {
    $btnProfileAddSlot.addEventListener('click', () => {
      modalSlots.push({ daysOfWeek: [1, 3, 5], start: '08:00', end: '10:00' });
      renderModalSlots(modalSlots);
    });
  }

  const $btnCreateSubject = $('#btnCreateSubject');
  if ($btnCreateSubject) {
    $btnCreateSubject.addEventListener('click', () => {
      openSubjectModal('study');
    });
  }

  const $inputSubjectType = $('#inputSubjectType');
  if ($inputSubjectType) {
    // Sync segmented control
    const segmentBtns = document.querySelectorAll('#subjectTypeSegments .ds-segment-btn');
    segmentBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        segmentBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        $inputSubjectType.value = btn.dataset.val;
        $inputSubjectType.dispatchEvent(new Event('change'));
      });
    });

    // Also update active button if openSubjectModal changes the select programmatically
    const updateSegmentActive = () => {
      segmentBtns.forEach(btn => {
        if (btn.dataset.val === $inputSubjectType.value) btn.classList.add('active');
        else btn.classList.remove('active');
      });
    };

    $inputSubjectType.addEventListener('change', (e) => {
      updateSegmentActive();
      const newType = e.target.value;
      subjectModalType = newType;
      const $formAddSyllabus = $('#formAddSyllabus');
      if ($formAddSyllabus) $formAddSyllabus.classList.toggle('hidden', newType !== 'study');
      const $formAddExercise = $('#formAddExercise');
      if ($formAddExercise) $formAddExercise.classList.toggle('hidden', newType !== 'training');
      const $formAddRoutineTask = $('#formAddRoutineTask');
      if ($formAddRoutineTask) $formAddRoutineTask.classList.toggle('hidden', newType !== 'inactive');
      modalContentItems = [];
      renderModalContentList(modalContentItems, newType);
    });
  }

  const $btnSyllabusAdd = $('#btnSyllabusAdd');
  if ($btnSyllabusAdd) {
    $btnSyllabusAdd.addEventListener('click', () => {
      const titleInput = $('#inputSyllabusTitle');
      const durInput = $('#inputSyllabusDuration');
      if (!titleInput || !durInput) return;
      const title = titleInput.value.trim();
      const durationVal = parseInt(durInput.value) || 0;
      const unit = 'min';

      if (!title) { DS.toast(I18n.t('alert.enter_topic'), 'warning'); return; }

      // Validate against max slot length
      if (modalSlots && modalSlots.length > 0) {
        let maxSlotMin = 0;
        let totalSlotMin = 0;
        modalSlots.forEach(s => {
          const [h1, m1] = s.start.split(':').map(Number);
          const [h2, m2] = s.end.split(':').map(Number);
          let dur = (h2 * 60 + m2) - (h1 * 60 + m1);
          if (dur < 0) dur += 24 * 60; // handle overnight
          if (dur > maxSlotMin) maxSlotMin = dur;
          totalSlotMin += (dur * s.daysOfWeek.length); // Total week capacity
        });

        if (maxSlotMin > 0 && durationVal > maxSlotMin) {
          DS.toast(I18n.t('alert.duration_exceeds_slot', { duration: durationVal, max: maxSlotMin }), 'warning');
          return;
        }
      }

      modalContentItems.push({ id: uid(), topic: title, duration: durationVal, unit: unit, description: '', status: 'pending' });
      titleInput.value = '';
      durInput.value = '';
      renderModalContentList(modalContentItems, 'study');
    });
  }

  const $btnExerciseAdd = $('#btnExerciseAdd');
  if ($btnExerciseAdd) {
    $btnExerciseAdd.addEventListener('click', () => {
      const nameInput = $('#inputExerciseName');
      const setsInput = $('#inputExerciseSets');
      const repsInput = $('#inputExerciseReps');
      const weightInput = $('#inputExerciseWeight');
      if (!nameInput) return;
      const name = nameInput.value.trim();
      if (!name) { DS.toast(I18n.t('alert.enter_exercise'), 'warning'); return; }
      const sets = parseInt(setsInput?.value) || 3;
      const reps = repsInput?.value || '12';
      const weight = weightInput?.value || '-';
      modalContentItems.push({ id: uid(), name, sets, reps, weight });
      nameInput.value = '';
      if (setsInput) setsInput.value = '';
      if (repsInput) repsInput.value = '';
      if (weightInput) weightInput.value = '';
      renderModalContentList(modalContentItems, 'training');
    });
  }

  const $btnRoutineTaskAdd = $('#btnRoutineTaskAdd');
  if ($btnRoutineTaskAdd) {
    $btnRoutineTaskAdd.addEventListener('click', () => {
      const taskInput = $('#inputRoutineTask');
      if (!taskInput) return;
      const task = taskInput.value.trim();
      if (!task) { DS.toast(I18n.t('alert.enter_routine'), 'warning'); return; }
      modalContentItems.push({ id: uid(), task });
      taskInput.value = '';
      renderModalContentList(modalContentItems, 'inactive');
    });
  }

      initPriorities();
      render();
      checkNotifications();
      initVerseMarquee();

      updateClock();
      setInterval(updateClock, 1000);
    
      // Update "now" indicator and notifications every minute
      let lastKnownDateKey = dateKey(new Date());
      setInterval(() => {
        const todayStr = dateKey(new Date());
        if (todayStr !== lastKnownDateKey) {
          lastKnownDateKey = todayStr;
          selectedDate = new Date(); // Auto-rollover to the new day
          render();
        }

        const pizzaPage = $('#pizzaPage');
        if (pizzaPage && !pizzaPage.classList.contains('hidden') && dateKey(selectedDate) === todayStr) {
          renderPizza();
        }
        checkNotifications();
      }, 60000);
    
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').then(reg => {
          reg.update();
        }).catch(() => {});
      }

      // Pull-to-refresh
      initPullToRefresh();
  });
