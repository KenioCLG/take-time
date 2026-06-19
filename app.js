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
if (!state.checkins) state.checkins = { affirmations: [], activeAffirmationId: null, records: [] };
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

function seedDefaultWorkout() {
  const workoutName = __('seed.workout_name', null, 'Full Body Metabolic');
  const hasWorkout = state.subjects.find(s => s.type === 'training');
  if (hasWorkout) return;

  const workout = {
    id: uid(),
    name: workoutName,
    color: '#ff2d55',
    type: 'training',
    exercises: [
      { id: uid(), name: __('seed.ex1', null, 'Squat + Calf Raise'), sets: 5, reps: '40s AMRAP', weight: __('seed.weight_dumbbells', null, 'Dumbbells') },
      { id: uid(), name: __('seed.ex2', null, 'Lower Abs (Reverse Crunch)'), sets: 5, reps: '40s AMRAP', weight: __('seed.weight_dumbbells', null, 'Dumbbells') },
      { id: uid(), name: __('seed.ex3', null, 'Stiff (Romanian Deadlift)'), sets: 5, reps: '40s AMRAP', weight: __('seed.weight_dumbbells', null, 'Dumbbells') },
      { id: uid(), name: __('seed.ex4', null, 'Alternating Bent Row'), sets: 5, reps: '40s AMRAP', weight: __('seed.weight_dumbbells', null, 'Dumbbells') },
      { id: uid(), name: __('seed.ex5', null, 'Reverse Lunge + Knee Drive'), sets: 5, reps: '40s AMRAP', weight: __('seed.weight_dumbbells', null, 'Dumbbells') },
      { id: uid(), name: __('seed.ex6', null, 'Arnold Press'), sets: 5, reps: '40s AMRAP', weight: __('seed.weight_dumbbells', null, 'Dumbbells') },
      { id: uid(), name: __('seed.ex7', null, 'Single-Leg Hip Thrust'), sets: 5, reps: '40s AMRAP', weight: __('seed.weight_ankles', null, 'Ankle Weights') },
      { id: uid(), name: __('seed.ex8', null, 'Bird Dog Row'), sets: 5, reps: '40s AMRAP', weight: __('seed.weight_dumbbells', null, 'Dumbbells') },
      { id: uid(), name: __('seed.ex9', null, 'Thruster (Squat + Press)'), sets: 5, reps: '40s AMRAP', weight: __('seed.weight_dumbbells', null, 'Dumbbells') },
      { id: uid(), name: __('seed.ex10', null, 'Dead Bug Weighted'), sets: 5, reps: '40s AMRAP', weight: __('seed.weight_light', null, 'Light Dumbbells') }
    ]
  };
  
  state.subjects.push(workout);
  Store.save(state);
}

function renderUserProfile() {
  const user = AuthService.getSessionUser();
  if (!user) return;
  const el = $('#userEmail');
  const avatar = $('#userAvatar');
  const since = $('#userSince');
  if (el) el.textContent = user.email || '—';
  if (avatar) avatar.textContent = (user.email || '?')[0].toUpperCase();
  if (since && user.created_at) {
    const d = new Date(user.created_at);
    since.textContent = __('settings.member_since', null, 'Membro desde') + ' ' + d.toLocaleDateString(state.settings?.language || 'pt-BR', { month: 'short', year: 'numeric' });
  }
}

async function loginUser() {
  DS.sheet.close($('#authDrawerOverlay'));
  // Ensure body is unlocked immediately — sheet close is async and
  // hiding authScreen can prevent transitionend from firing
  DS.sheet.unlockBody();
  $('#authScreen').style.display = 'none';
  document.documentElement.classList.add('authenticated');
  const app = $('#app');
  app.style.display = 'block';
  app.classList.add('app-fade-in');
  app.addEventListener('animationend', () => app.classList.remove('app-fade-in'), { once: true });
  renderUserProfile();

  // Render IMMEDIATELY with local data — no waiting for network
  render();
  renderSubjects();
  renderNotes();
  if (typeof initPriorities === 'function') initPriorities();
  if (typeof updateMarqueeVisibility === 'function') updateMarqueeVisibility();
  if (typeof hydrateSettingsDOM === 'function') hydrateSettingsDOM();

  // Onboarding automatico (sync-independent)
  if (state.subjects && state.subjects.length === 0) {
    seedDefaultWorkout();
    render();
    renderSubjects();
  }

  // Sync from cloud in background — re-render when done
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
      renderNotes();
      if (_currentTab === 'atomic') renderAtomic();
      if (typeof initPriorities === 'function') initPriorities();
      hydrateSettingsDOM();
    }
  }).catch(e => console.warn('Sync on login failed:', e));
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
    loginUser();
  } else {
    let msg = __('auth.login_error', null, 'Erro ao fazer login');
    if (result.error === AuthError.INVALID_EMAIL) msg = __('auth.invalid_email', null, 'E-mail inválido');
    else if (result.error === AuthError.EMPTY_FIELDS) msg = __('auth.fill_fields', null, 'Preencha os campos');
    else if (typeof result.error === 'string') msg = result.error;
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
    if (AuthService.isAuthenticated()) {
      DS.toast(__('auth.account_created', null, 'Conta criada com sucesso!'), 'success');
      loginUser();
    } else {
      DS.toast(__('auth.confirm_email', null, 'Conta criada! Verifique seu e-mail para confirmar.'), 'success', 5000);
      $('#authBodySignup').classList.add('hidden');
      $('#authBodyLogin').classList.remove('hidden');
      $('#authTitle').textContent = __('auth.login', null, 'Acessar Conta');
    }
  } else {
    let msg = __('auth.signup_error', null, 'Erro ao criar conta');
    if (result.error === AuthError.PASSWORD_MISMATCH) msg = __('auth.password_mismatch', null, 'As senhas não coincidem');
    else if (result.error === AuthError.INVALID_EMAIL) msg = __('auth.invalid_email', null, 'E-mail inválido');
    else if (result.error === AuthError.WEAK_PASSWORD) msg = __('auth.weak_password', null, 'A senha deve ter pelo menos 6 caracteres');
    else if (result.error === AuthError.EMPTY_FIELDS) msg = __('auth.fill_fields', null, 'Preencha todos os campos');
    else if (typeof result.error === 'string') msg = result.error;
    
    DS.toast(msg, 'error', 4000);
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
  const lang = state.settings?.language || 'pt-BR';
  const timestamp = now.toLocaleDateString(lang, { day: '2-digit', month: '2-digit' })
    + ' ' + now.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
  state.logs.unshift({ id: uid(), timestamp, message });
  if (state.logs.length > MAX_LOG_SIZE) state.logs.pop();
  renderLogs();
  Store.save(state);
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


// Type badge icon for block cards
function blockTypeIconSvg(type, color) {
  const iconMap = { study: 'book', training: 'dumbbell', inactive: 'checkCircle' };
  const name = iconMap[type] || 'book';
  return `<span style="color:${color}">${DS.icon(name, { size: 16 })}</span>`;
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

function addMinutes(time, min) {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + min;
  const rh = Math.floor(total / 60) % 24;
  const rm = total % 60;
  return `${String(rh).padStart(2, '0')}:${String(rm).padStart(2, '0')}`;
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

  // Progress ring (inside inner circle)
  const RING_R = R_INNER - 8;
  const ringBg = document.createElementNS(SVG_NS, 'circle');
  ringBg.setAttribute('cx', CX);
  ringBg.setAttribute('cy', CY);
  ringBg.setAttribute('r', RING_R);
  ringBg.setAttribute('fill', 'none');
  ringBg.setAttribute('stroke', 'var(--ds-fill-tertiary)');
  ringBg.setAttribute('stroke-width', '4');
  ringBg.setAttribute('class', 'pizza-ring-bg');
  svg.appendChild(ringBg);

  // Calculate progress for ring
  const activeForRing = dayBlocks.filter(b => {
    const s = state.subjects.find(s => s.id === b.subjectId);
    return s?.type !== 'inactive';
  });
  const doneForRing = activeForRing.filter(b => b.done).length;
  const pctForRing = activeForRing.length > 0 ? doneForRing / activeForRing.length : 0;
  const circumference = 2 * Math.PI * RING_R;

  if (dayBlocks.length > 0) {
    const ringFill = document.createElementNS(SVG_NS, 'circle');
    ringFill.setAttribute('cx', CX);
    ringFill.setAttribute('cy', CY);
    ringFill.setAttribute('r', RING_R);
    ringFill.setAttribute('fill', 'none');
    ringFill.setAttribute('stroke', pctForRing >= 1 ? 'var(--ds-success)' : 'var(--ds-accent)');
    ringFill.setAttribute('stroke-width', '4');
    ringFill.setAttribute('stroke-linecap', 'round');
    ringFill.setAttribute('stroke-dasharray', `${circumference}`);
    ringFill.setAttribute('stroke-dashoffset', `${circumference * (1 - pctForRing)}`);
    ringFill.setAttribute('transform', `rotate(-90 ${CX} ${CY})`);
    ringFill.setAttribute('class', 'pizza-ring-fill');
    svg.appendChild(ringFill);
  }

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

        // Check icon (only when block is done)
        if (block.done) {
          const midAngle = (sa + ea) / 2;
          const midR = (R_OUTER + R_INNER) / 2;
          const midP = polarToXY(midAngle, midR);
          const arcSpan = ea - sa;

          if (arcSpan > 8) {
            const iconSize = arcSpan > 25 ? 20 : 14;
            const iconColor = isInactive ? 'var(--ds-text-tertiary)' : iconContrastColor(color);
            const s = iconSize / 24;
            const g = document.createElementNS(SVG_NS, 'g');
            g.setAttribute('transform', `translate(${midP.x - iconSize/2}, ${midP.y - iconSize/2})`);
            g.setAttribute('pointer-events', 'none');
            const check = document.createElementNS(SVG_NS, 'polyline');
            check.setAttribute('points', `${6*s},${12.5*s} ${10*s},${16.5*s} ${18*s},${8*s}`);
            check.setAttribute('fill', 'none');
            check.setAttribute('stroke', iconColor);
            check.setAttribute('stroke-width', `${2.5*s}`);
            check.setAttribute('stroke-linecap', 'round');
            check.setAttribute('stroke-linejoin', 'round');
            g.appendChild(check);
            svg.appendChild(g);
          }
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

  const centerLabel = $('#pizzaCenterLabel');
  const centerPct = $('#pizzaCenterPct');
  if (activeBlocks.length > 0) {
    centerPct.textContent = `${pct}%`;
    centerPct.style.color = pct >= 100 ? 'var(--ds-success)' : 'var(--ds-accent)';
    centerLabel.textContent = I18n.t('pizza.completed', { done, total: activeBlocks.length });
  } else {
    centerPct.textContent = '';
    centerLabel.textContent = '';
  }
}

// ===== RENDER: BLOCK LIST =====
const activeExpandedBlocks = new Set();

function renderMiniTracker(block, subj, color) {
  if (!subj || (subj.type !== 'training' && subj.type !== 'inactive')) return '';
  
  const items = subj.type === 'training' ? (subj.exercises || []) : (subj.checklist || []);
  if (items.length === 0) return '';
  
  const completedItems = block.completedItems || [];
  
  return `
    <div class="block-mini-tracker">
      ${items.map((item, idx) => {
        const isChecked = completedItems.includes(item.id);
        const label = subj.type === 'training' ? (idx + 1) : (item.task ? item.task.substring(0, 1).toUpperCase() : (idx + 1));
        const title = subj.type === 'training' ? `${item.name} (${item.sets}x${item.reps})` : item.task;
        
        return `
          <div class="mini-tracker-chip ${isChecked ? 'checked' : ''}" 
               data-block-id="${block.id}" 
               data-item-id="${item.id}" 
               data-type="${subj.type}"
               title="${DS.escapeHtml(title)}"
               style="--block-color:${color}"
          >
            ${isChecked ? DS.icon('check', { size: 10, strokeWidth: 4 }) : label}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderBlockList() {
  const container = $('#blockList');
  const dayBlocks = state.blocks
    .filter(b => b.date === dateKey(selectedDate))
    .sort((a, b) => a.start.localeCompare(b.start));

  if (dayBlocks.length === 0) {
    container.innerHTML = `<div class="block-empty" style="text-align:center; padding:48px 20px;">
${DS.icon('calendar', { size: 56, strokeWidth: 1.5, class: 'ds-empty-icon' })}
      <p style="font-size:15px; font-weight:600; color:var(--ds-text-secondary); margin:0 0 4px;">
        ${I18n.t('block.empty_title', null, 'Nenhum bloco agendado')}
      </p>
      <p style="font-size:13px; color:var(--ds-text-tertiary); margin:0;">
        ${I18n.t('block.empty_hint', null, 'Toque em + para criar seu primeiro bloco')}
      </p>
    </div>`;
    return;
  }

  // Day summary bar (exclude inactive from completion tracking, same as pizza)
  const summaryBlocks = dayBlocks.filter(b => {
    const s = state.subjects.find(s => s.id === b.subjectId);
    return s?.type !== 'inactive';
  });
  const totalBlocks = summaryBlocks.length;
  const doneBlocks = summaryBlocks.filter(b => b.done).length;
  const dayPct = totalBlocks > 0 ? Math.round((doneBlocks / totalBlocks) * 100) : 0;
  const viewBtns = `<div class="view-btns">
    <button class="view-btn" id="btnMonthView" title="${I18n.t('month_view.title', null, 'Visão Mensal')}">
      ${DS.icon('calendar', { size: 16 })}
    </button>
    <button class="view-btn" id="btnStats" title="${I18n.t('stats.title', null, 'Estatísticas')}">
      ${DS.icon('chart', { size: 16 })}
    </button>
    <button class="view-btn" id="btnShare" title="Compartilhar">
      ${DS.icon('share', { size: 16 })}
    </button>
    <button class="view-btn" id="btnSaveTemplate" title="${I18n.t('template.save', null, 'Salvar template')}">
      ${DS.icon('notes', { size: 16 })}
    </button>
    <button class="view-btn" id="btnApplyTemplate" title="${I18n.t('template.apply', null, 'Aplicar template')}">
      ${DS.icon('notes', { size: 16 })}
    </button>
  </div>`;

  const summaryHtml = totalBlocks > 0 ? `
    <div class="day-summary-bar">
      <span class="day-summary-text">${doneBlocks}/${totalBlocks} ${I18n.t('pizza.done_label', null, 'concluídas')}</span>
      <div class="day-summary-track">
        <div class="day-summary-fill" style="width:${dayPct}%; background:${dayPct >= 100 ? 'var(--ds-success)' : 'var(--ds-accent)'}"></div>
      </div>
      <span class="day-summary-pct">${dayPct}%</span>
      ${viewBtns}
    </div>
  ` : viewBtns;

  container.innerHTML = summaryHtml + dayBlocks.map(block => {
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
                ${(() => {
                  const groups = {};
                  const noMat = [];
                  syllabus.forEach(item => {
                    if (item.materia) {
                      if (!groups[item.materia]) groups[item.materia] = [];
                      groups[item.materia].push(item);
                    } else {
                      noMat.push(item);
                    }
                  });
                  let opts = '';
                  for (const [mat, items] of Object.entries(groups)) {
                    opts += `<optgroup label="${DS.escapeHtml(mat)}">`;
                    opts += items.map(item => `<option value="${item.id}" ${item.id === selectedId ? 'selected' : ''}>[${item.status === 'completed' ? '\u2713' : '\u25CB'}] ${DS.escapeHtml(item.topic)}</option>`).join('');
                    opts += '</optgroup>';
                  }
                  opts += noMat.map(item => `<option value="${item.id}" ${item.id === selectedId ? 'selected' : ''}>[${item.status === 'completed' ? '\u2713' : '\u25CB'}] ${DS.escapeHtml(item.topic)}</option>`).join('');
                  return opts;
                })()}
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
                ${DS.aicon('clock', { size: 14 })} ${I18n.t('block.edit_time')}
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
                ${DS.aicon('clock', { size: 14 })} ${I18n.t('block.edit_time')}
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
                ${DS.aicon('clock', { size: 14 })} ${I18n.t('block.edit_time')}
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
            ${renderMiniTracker(block, subj, color)}
          </div>
          <button class="block-check ${block.done ? 'checked' : ''}" data-block-id="${block.id}">
            ${DS.icon('check', { size: 16, strokeWidth: 3 })}
          </button>
        </div>
        ${detailsHtml}
      </div>
    `;
  }).join('');

  // Sortable drag to swap block times
  if (window.Sortable && dayBlocks.length > 1) {
    new Sortable(container, {
      animation: 150,
      ghostClass: 'sortable-ghost',
      handle: '.block-type-badge',
      draggable: '.block-item-container',
      forceFallback: true,
      onEnd: function(evt) {
        if (evt.oldIndex === evt.newIndex) return;
        const sorted = [...container.querySelectorAll('.block-card[data-id]')];
        const ids = sorted.map(el => el.dataset.id);
        // Collect original times in order
        const originalTimes = dayBlocks.map(b => ({ start: b.start, end: b.end }));
        // Assign times to new order
        ids.forEach((id, i) => {
          const block = state.blocks.find(b => b.id === id);
          if (block && originalTimes[i]) {
            block.start = originalTimes[i].start;
            block.end = originalTimes[i].end;
          }
        });
        Store.save(state);
        render();
      }
    });
  }

  // View buttons
  const bmv = container.querySelector('#btnMonthView');
  if (bmv) bmv.addEventListener('click', (e) => { e.stopPropagation(); openMonthView(); });
  const bst = container.querySelector('#btnStats');
  if (bst) bst.addEventListener('click', (e) => { e.stopPropagation(); openStats(); });
  const bsh = container.querySelector('#btnShare');
  if (bsh) bsh.addEventListener('click', (e) => { e.stopPropagation(); shareSchedule(); });
  const bsv = container.querySelector('#btnSaveTemplate');
  if (bsv) bsv.addEventListener('click', (e) => { e.stopPropagation(); saveAsTemplate(); });
  const bat = container.querySelector('#btnApplyTemplate');
  if (bat) bat.addEventListener('click', (e) => { e.stopPropagation(); applyTemplate(); });

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

  // Mini tracker chip click binder
  container.querySelectorAll('.mini-tracker-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      const blockId = chip.dataset.blockId;
      const itemId = chip.dataset.itemId;
      const block = state.blocks.find(b => b.id === blockId);
      if (block) {
        if (!block.completedItems) block.completedItems = [];
        const isChecked = block.completedItems.includes(itemId);
        
        if (isChecked) {
          block.completedItems = block.completedItems.filter(id => id !== itemId);
        } else {
          block.completedItems.push(itemId);
        }
        
        // Auto-complete block if all items are done
        const subj = state.subjects.find(s => s.id === block.subjectId);
        const list = subj?.type === 'training' ? subj.exercises : subj?.checklist;
        const total = list?.length || 0;
        
        if (total > 0 && block.completedItems.length === total) {
          block.done = true;
        } else {
          block.done = false;
        }
        
        // Haptic feedback
        if (navigator.vibrate) {
          navigator.vibrate(!isChecked ? [15, 30] : 10);
        }
        
        const itemName = list?.find(x => x.id === itemId)?.name || list?.find(x => x.id === itemId)?.task || itemId;
        logAction(I18n.t(!isChecked ? 'log.exercise_done' : 'log.exercise_undone', { name: itemName }));
        
        // Sincronizar com o habitLog se for rotina (inactive)
        if (subj?.type === 'inactive') {
          const hl = getOrCreateTodayHabitLog();
          const todayKey = block.date;
          if (!isChecked) {
            if (!hl.find(h => h.habitId === itemId && h.date === todayKey)) {
              hl.push({ date: todayKey, habitId: itemId, habitText: itemName, subjectId: block.subjectId, done: true });
            }
          } else {
            const idx = hl.findIndex(h => h.habitId === itemId && h.date === todayKey);
            if (idx >= 0) hl.splice(idx, 1);
          }
        }
        
        Store.save(state);
        render();
      }
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
        logAction(I18n.t(chk.checked ? 'log.routine_done' : 'log.routine_undone', { name: routineItem?.task || taskId }));

        // Log to habitLog for today
        const hl = getOrCreateTodayHabitLog();
        const todayKey = block.date;
        if (chk.checked) {
          if (!hl.find(h => h.habitId === taskId && h.date === todayKey)) {
            hl.push({ date: todayKey, habitId: taskId, habitText: routineItem?.task || taskId, subjectId: block.subjectId, done: true });
          }
        } else {
          const idx = hl.findIndex(h => h.habitId === taskId && h.date === todayKey);
          if (idx >= 0) hl.splice(idx, 1);
        }

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

  // Day notes section — show notes linked to this date
  const dayNotes = (state.notes || []).filter(n => n.date === dateKey(selectedDate));
  if (dayNotes.length > 0) {
    const notesSection = document.createElement('div');
    notesSection.className = 'day-notes-section';
    notesSection.innerHTML = `
      <div class="day-notes-header">
        <span class="ds-label" style="font-size:11px;">${I18n.t('tab.notes', null, 'Notas')} (${dayNotes.length})</span>
      </div>
      ${dayNotes.map(note => {
        const preview = (note.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 60);
        return `
          <div class="day-note-card" data-note-id="${note.id}">
            <span class="day-note-title">${DS.escapeHtml(note.title || I18n.t('note.untitled', null, 'Sem título'))}</span>
            ${preview ? `<span class="day-note-preview">${DS.escapeHtml(preview)}</span>` : ''}
          </div>`;
      }).join('')}
    `;
    container.appendChild(notesSection);

    notesSection.querySelectorAll('.day-note-card').forEach(card => {
      card.addEventListener('click', () => openNoteModal(card.dataset.noteId));
    });
  }
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
  btnPrev.innerHTML = DS.icon('chevronL', { size: 16, strokeWidth: 2.5 });
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
  btnNext.innerHTML = DS.icon('chevronR', { size: 16, strokeWidth: 2.5 });
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
    list.innerHTML = `<div style="text-align:center; padding:48px 20px;">
${DS.icon('book', { size: 48, strokeWidth: 1.5, class: 'ds-empty-icon' })}
      <p style="color:var(--ds-text-tertiary); font-size:15px; font-weight:500; margin:0 0 4px;">
        ${I18n.t('subject.empty_title', null, 'Nenhuma atividade')}
      </p>
      <p style="color:var(--ds-text-quaternary); font-size:13px; margin:0;">
        ${I18n.t('subject.empty_hint', null, 'Toque em + para criar seu primeiro perfil')}
      </p>
    </div>`;
    return;
  }

  const sectionIcons = {
    study: DS.aicon('book', { size: 18, trigger: 'hover' }),
    training: DS.icon('dumbbell', { size: 18 }),
    inactive: DS.aicon('checkCircle', { size: 18, trigger: 'hover' }),
  };

  list.innerHTML = sections.map(({ type, cfg, items }) => `
    <div class="subject-section">
      <div class="subject-section-header ds-icon-animate">
        <span class="subject-section-icon">${sectionIcons[type] || DS.icon(cfg.icon, { size: 18 })}</span>
        <span class="subject-section-title">${DS.escapeHtml(I18n.t(cfg.i18nKey))}</span>
        <span class="subject-section-count">${items.length}</span>
        <button class="ds-btn ds-btn-icon-sm subject-section-add" data-type="${type}" aria-label="${I18n.t(cfg.i18nKey)}">
          ${DS.aicon('plus', { size: 16, strokeWidth: 2.5 })}
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

  const editInfo = $('#blockEditInfo');
  const createSubject = $('#blockCreateSubject');
  const createTopic = $('#blockCreateTopic');
  const createTime = $('#blockCreateTime');

  if (blockId) {
    const block = state.blocks.find(b => b.id === blockId);
    if (!block) return;
    const subj = state.subjects.find(s => s.id === block.subjectId);
    const color = subj?.color || '#8e8e93';

    $('#modalTitle').textContent = I18n.t('block.edit');
    $('#inputSubject').value = block.subjectId;
    $('#inputTopic').value = block.topic || '';
    $('#inputStart').value = block.start;
    $('#inputEnd').value = block.end;
    $('#btnDeleteBlock').classList.remove('hidden');
    $('#btnDeleteBlock').textContent = I18n.t('block.remove_today', null, 'Remover só hoje');

    // Edit mode: show info card, hide create fields
    editInfo.classList.remove('hidden');
    createSubject.classList.add('hidden');
    createTopic.classList.add('hidden');
    createTime.classList.add('hidden');

    // Fill info card
    const typeKey = subj?.type || 'study';
    $('#blockEditBadge').innerHTML = blockTypeIconSvg(typeKey, color);
    $('#blockEditBadge').style.background = `color-mix(in srgb, ${color} 12%, transparent)`;
    $('#blockEditName').textContent = subj?.name || I18n.t('block.no_subject');
    const dur = durationLabel(block.start, block.end);
    $('#blockEditTime').textContent = `${block.start} – ${block.end}${dur ? ' · ' + dur : ''}`;

    // Montar o popup da pizza com os Assuntos para check
    const checklistContainer = $('#modalBlockSubjectChecklist');
    if (checklistContainer && subj) {
      if (subj.type === 'study') {
        const syllabus = subj.syllabus || [];
        if (syllabus.length === 0) {
          checklistContainer.innerHTML = `<p class="subject-empty" style="font-size:12px; color:var(--ds-text-tertiary);">Nenhum assunto cadastrado.</p>`;
        } else {
          // Group by matéria
          const groups = {};
          const noMateria = [];
          syllabus.forEach(item => {
            if (item.materia) {
              if (!groups[item.materia]) groups[item.materia] = [];
              groups[item.materia].push(item);
            } else {
              noMateria.push(item);
            }
          });

          let itemsHtml = '';
          const renderItem = (item) => `
            <label style="display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer; padding:2px 0;">
              <input type="checkbox" class="pizza-chk-syllabus" data-subject-id="${subj.id}" data-item-id="${item.id}" ${item.status === 'completed' ? 'checked' : ''} style="width:16px; height:16px; accent-color:var(--ds-accent);">
              <span style="${item.status === 'completed' ? 'text-decoration:line-through; color:var(--ds-text-tertiary);' : 'color:var(--ds-text-primary);'}">${DS.escapeHtml(item.topic)}</span>
            </label>`;

          for (const [materia, items] of Object.entries(groups)) {
            const done = items.filter(i => i.status === 'completed').length;
            itemsHtml += `
              <div class="pizza-materia-group">
                <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 0; border-bottom:1px solid var(--ds-separator);">
                  <span style="font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; color:var(--ds-text-secondary);">${DS.escapeHtml(materia)}</span>
                  <span style="font-size:10px; color:var(--ds-text-tertiary);">${done}/${items.length}</span>
                </div>
                ${items.map(renderItem).join('')}
              </div>`;
          }
          noMateria.forEach(item => { itemsHtml += renderItem(item); });

          checklistContainer.innerHTML = `
            <label class="ds-label" style="font-size:11px; margin-bottom:8px;">${I18n.t('syllabus.label', null, 'Assuntos')}</label>
            <div style="max-height: 200px; overflow-y: auto; display:flex; flex-direction:column; gap:4px;">
              ${itemsHtml}
            </div>
          `;

          // Adicionar listeners nos checkboxes
          checklistContainer.querySelectorAll('.pizza-chk-syllabus').forEach(chk => {
            chk.addEventListener('change', (e) => {
              const subjectId = e.target.dataset.subjectId;
              const itemId = e.target.dataset.itemId;
              const isChecked = e.target.checked;
              
              const subject = state.subjects.find(s => s.id === subjectId);
              if (subject && subject.syllabus) {
                const topic = subject.syllabus.find(t => t.id === itemId);
                if (topic) {
                  topic.status = isChecked ? 'completed' : 'pending';
                  Store.save(state);
                  logAction(I18n.t(topic.status === 'completed' ? 'log.syllabus_done' : 'log.syllabus_undone', { name: topic.topic }));
                  // Atualiza o visual local do texto riscado
                  const span = e.target.nextElementSibling;
                  if (isChecked) {
                    span.style.textDecoration = 'line-through';
                    span.style.color = 'var(--ds-text-tertiary)';
                  } else {
                    span.style.textDecoration = 'none';
                    span.style.color = 'var(--ds-text-primary)';
                  }
                  // Chama render() silenciosamente para atualizar pizza etc se precisar
                  requestAnimationFrame(() => {
                    render();
                    renderSubjects();
                  });
                }
              }
            });
          });
        }
        checklistContainer.classList.remove('hidden');
      } else if (subj.type === 'training') {
        const exercises = subj.exercises || [];
        if (exercises.length === 0) {
          checklistContainer.innerHTML = `<p class="subject-empty" style="font-size:12px; color:var(--ds-text-tertiary);">${I18n.t('exercise.none', null, 'Nenhum exercício cadastrado.')}</p>`;
        } else {
          const completedItems = block.completedItems || [];
          checklistContainer.innerHTML = `
            <label class="ds-label" style="font-size:11px; margin-bottom:8px;">${I18n.t('exercise.sheet', null, 'Ficha de Treino')}</label>
            <div style="max-height: 150px; overflow-y: auto; display:flex; flex-direction:column; gap:8px;">
              ${exercises.map(ex => {
                const isChecked = completedItems.includes(ex.id);
                return `
                <label style="display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer;">
                  <input type="checkbox" class="pizza-chk-exercise" data-block-id="${block.id}" data-ex-id="${ex.id}" ${isChecked ? 'checked' : ''} style="width:16px; height:16px; accent-color:var(--ds-accent);">
                  <span style="${isChecked ? 'text-decoration:line-through; color:var(--ds-text-tertiary);' : 'color:var(--ds-text-primary);'}">${DS.escapeHtml(ex.name)}</span>
                  <span style="margin-left:auto; font-size:11px; color:var(--ds-text-tertiary);">${ex.sets}x${ex.reps}${ex.weight ? ' ('+ex.weight+')' : ''}</span>
                </label>`;
              }).join('')}
            </div>
          `;
          checklistContainer.querySelectorAll('.pizza-chk-exercise').forEach(chk => {
            chk.addEventListener('change', (e) => {
              const blockId = e.target.dataset.blockId;
              const exId = e.target.dataset.exId;
              const b = state.blocks.find(bl => bl.id === blockId);
              if (!b) return;
              if (!b.completedItems) b.completedItems = [];
              if (e.target.checked) {
                if (!b.completedItems.includes(exId)) b.completedItems.push(exId);
              } else {
                b.completedItems = b.completedItems.filter(id => id !== exId);
              }
              const total = exercises.length;
              b.done = total > 0 && b.completedItems.length === total;
              Store.save(state);
              const span = e.target.nextElementSibling;
              span.style.textDecoration = e.target.checked ? 'line-through' : 'none';
              span.style.color = e.target.checked ? 'var(--ds-text-tertiary)' : 'var(--ds-text-primary)';
              requestAnimationFrame(() => { render(); renderSubjects(); });
            });
          });
        }
        checklistContainer.classList.remove('hidden');
      } else if (subj.type === 'inactive') {
        const checklist = subj.checklist || [];
        if (checklist.length === 0) {
          checklistContainer.innerHTML = `<p class="subject-empty" style="font-size:12px; color:var(--ds-text-tertiary);">${I18n.t('routine.none', null, 'Nenhum hábito cadastrado.')}</p>`;
        } else {
          const completedItems = block.completedItems || [];
          checklistContainer.innerHTML = `
            <label class="ds-label" style="font-size:11px; margin-bottom:8px;">${I18n.t('routine.label', null, 'Rotina')}</label>
            <div style="max-height: 150px; overflow-y: auto; display:flex; flex-direction:column; gap:8px;">
              ${checklist.map(task => {
                const isChecked = completedItems.includes(task.id);
                return `
                <label style="display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer;">
                  <input type="checkbox" class="pizza-chk-routine" data-block-id="${block.id}" data-task-id="${task.id}" ${isChecked ? 'checked' : ''} style="width:16px; height:16px; accent-color:var(--ds-accent);">
                  <span style="${isChecked ? 'text-decoration:line-through; color:var(--ds-text-tertiary);' : 'color:var(--ds-text-primary);'}">${DS.escapeHtml(task.task)}</span>
                </label>`;
              }).join('')}
            </div>
          `;
          checklistContainer.querySelectorAll('.pizza-chk-routine').forEach(chk => {
            chk.addEventListener('change', (e) => {
              const blockId = e.target.dataset.blockId;
              const taskId = e.target.dataset.taskId;
              const b = state.blocks.find(bl => bl.id === blockId);
              if (!b) return;
              if (!b.completedItems) b.completedItems = [];
              if (e.target.checked) {
                if (!b.completedItems.includes(taskId)) b.completedItems.push(taskId);
              } else {
                b.completedItems = b.completedItems.filter(id => id !== taskId);
              }
              const total = checklist.length;
              b.done = total > 0 && b.completedItems.length === total;
              Store.save(state);
              const span = e.target.nextElementSibling;
              span.style.textDecoration = e.target.checked ? 'line-through' : 'none';
              span.style.color = e.target.checked ? 'var(--ds-text-tertiary)' : 'var(--ds-text-primary)';
              requestAnimationFrame(() => { render(); renderSubjects(); });
            });
          });
        }
        checklistContainer.classList.remove('hidden');
      } else {
        checklistContainer.classList.add('hidden');
      }
    }

  } else {
    $('#modalTitle').textContent = I18n.t('block.new');
    $('#inputTopic').value = '';
    $('#inputStart').value = '08:00';
    $('#inputEnd').value = '09:00';
    $('#btnDeleteBlock').classList.add('hidden');
    if (state.subjects.length > 0) $('#inputSubject').value = state.subjects[0].id;

    // Create mode: show create fields, hide edit info
    editInfo.classList.add('hidden');
    createSubject.classList.remove('hidden');
    createTopic.classList.remove('hidden');
    createTime.classList.remove('hidden');
    const checklistContainer = $('#modalBlockSubjectChecklist');
    if (checklistContainer) checklistContainer.classList.add('hidden');
  }

  DS.sheet.open($('#modalBlock'), 0.92);
}


function closeBlockModal() { DS.sheet.close($('#modalBlock')); editingBlockId = null; }

function showHeatmapInfo() {
  DS.toast('O heatmap mostra seus dias mais produtivos — quanto mais blocos concluídos, mais intenso o tom do quadrado.');
}
function showPrioritiesInfo() {
  DS.toast('Organize suas atividades em 3 círculos: o mais interno é o que importa hoje, os externos são o que pode esperar.');
}
function showStudyTipsInfo() {
  DS.toast('Cadastre matérias e assuntos — use "Matéria" para agrupar (ex: "Dir. Constitucional") e "Assunto" para o tópico específico (ex: "Art. 1º").');
}

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

function updateMateriaDatalist() {
  const dl = $('#datalistMaterias');
  if (!dl) return;
  const materias = [...new Set(modalContentItems.filter(i => i.materia).map(i => i.materia))];
  dl.innerHTML = materias.map(m => `<option value="${DS.escapeHtml(m)}">`).join('');
}

function renderModalContentList(items = [], type = 'study') {
  modalContentItems = [...items];
  const listEl = $('#profileContentList');

  const render = () => {
    if (modalContentItems.length === 0) {
      listEl.innerHTML = `<p class="content-none">${I18n.t('content.none')}</p>`;
      return;
    }

    if (type === 'study') {
      // Group by matéria
      const groups = {};
      const noMateria = [];
      modalContentItems.forEach((item, index) => {
        item._index = index;
        if (item.materia) {
          if (!groups[item.materia]) groups[item.materia] = [];
          groups[item.materia].push(item);
        } else {
          noMateria.push(item);
        }
      });

      let html = '';
      for (const [materia, items] of Object.entries(groups)) {
        const completedCount = items.filter(i => i.status === 'completed').length;
        html += `<div class="materia-group">
          <div class="materia-header">
            <span class="materia-name">${DS.escapeHtml(materia)}</span>
            <span class="materia-count">${completedCount}/${items.length}</span>
          </div>`;
        items.forEach(item => {
          const statusIcon = item.status === 'completed' ? '✓' : '○';
          const statusClass = item.status === 'completed' ? 'completed' : '';
          html += `
            <div class="ds-list-item content-item-row ${statusClass}" data-id="${item.id}">
              <span class="assunto-status">${statusIcon}</span>
              <div style="flex:1; min-width:0; font-size:13px;">${DS.escapeHtml(item.topic)}</div>
              <button type="button" class="ds-btn ds-btn-plain btn-remove-content remove-content-btn" data-index="${item._index}">
                ${DS.icon('x', { size: 16 })}
              </button>
            </div>`;
        });
        html += '</div>';
      }
      // Ungrouped items
      noMateria.forEach(item => {
        const statusIcon = item.status === 'completed' ? '✓' : '○';
        html += `
          <div class="ds-list-item content-item-row" data-id="${item.id}">
            <span class="assunto-status">${statusIcon}</span>
            <div style="flex:1; min-width:0; font-size:13px;">${DS.escapeHtml(item.topic)}</div>
            <button type="button" class="ds-btn ds-btn-plain btn-remove-content remove-content-btn" data-index="${item._index}">
              ${DS.icon('x', { size: 16 })}
            </button>
          </div>`;
      });

      listEl.innerHTML = html;
    } else {
      // Training / Routine — flat list
      listEl.innerHTML = modalContentItems.map((item, index) => {
        let desc = '';
        if (type === 'training') {
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
    }
    
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
      <div class="priority-item" data-id="${item.id}">
        <span>${DS.escapeHtml(item.name)}</span>
        <button class="priority-delete-btn" onclick="deletePriorityItem('${item.id}')" style="background:none; border:none; cursor:pointer; color:var(--ds-text-tertiary); padding:0 2px; margin-left:auto; display:flex; align-items:center; opacity:0.5;">
          ${DS.icon('x', { size: 14 })}
        </button>
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

function promptAddPriority() {
  const name = prompt(__('priorities.add_prompt', null, 'Nome da área de vida:'));
  if (!name || !name.trim()) return;
  if (!state.priorities) state.priorities = { zone1: [], zone2: [], zone3: [], unallocated: [] };
  state.priorities.unallocated.push({ id: uid(), name: name.trim() });
  Store.save(state);
  renderPriorities();
  initPriorities();
}

function deletePriorityItem(itemId) {
  if (!state.priorities) return;
  ['zone1', 'zone2', 'zone3', 'unallocated'].forEach(zone => {
    state.priorities[zone] = (state.priorities[zone] || []).filter(i => i.id !== itemId);
  });
  Store.save(state);
  renderPriorities();
  initPriorities();
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
    if (block) {
      block.subjectId = subjectId; block.topic = topic; block.start = start; block.end = end;
    }
    logAction(I18n.t('log.edited_block', { name: topic || subj?.name, start, end }));
  } else {
    state.blocks.push({
      id: uid(), date: dateKey(selectedDate),
      subjectId, topic, start, end, done: false,
      completedItems: [],
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

// ===== NOTES =====
let editingNoteId = null;
let currentNoteFilterTag = null;
let _selectedNoteTags = new Set();

function renderNotes() {
  const list = $('#notesList');
  const tagsFilterContainer = $('#notesTagsFilter');
  if (!list) return;
  const notes = state.notes || [];

  if (notes.length === 0) {
    if (tagsFilterContainer) tagsFilterContainer.innerHTML = '';
    list.innerHTML = `<div class="notes-empty" style="text-align:center; padding:48px 20px;">
${DS.icon('notes', { size: 48, strokeWidth: 1.5, class: 'ds-empty-icon' })}
      <p style="color:var(--ds-text-tertiary); font-size:15px; font-weight:500; margin:0 0 4px;">
        ${I18n.t('note.empty_title', null, 'Nenhuma nota ainda')}
      </p>
      <p style="color:var(--ds-text-quaternary); font-size:13px; margin:0;">
        ${I18n.t('note.empty_hint', null, 'Toque em + para criar sua primeira nota')}
      </p>
    </div>`;
    return;
  }

  // Coletar todas as tags únicas
  const allTags = new Set();
  notes.forEach(n => {
    if (n.tags && n.tags.length > 0) {
      n.tags.forEach(t => allTags.add(t));
    }
  });

  // Renderizar o filtro de tags
  if (tagsFilterContainer) {
    if (allTags.size > 0) {
      let tagsHtml = `<button class="ds-tag-chip ${currentNoteFilterTag === null ? 'active' : ''}" data-tag="ALL">Todas</button>`;
      Array.from(allTags).sort().forEach(tag => {
        const isActive = currentNoteFilterTag === tag;
        tagsHtml += `<button class="ds-tag-chip ${isActive ? 'active' : ''}" data-tag="${DS.escapeHtml(tag)}">${DS.escapeHtml(tag)}</button>`;
      });
      tagsFilterContainer.innerHTML = tagsHtml;

      // Listeners
      tagsFilterContainer.querySelectorAll('.ds-tag-chip').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const tag = e.target.dataset.tag;
          currentNoteFilterTag = tag === 'ALL' ? null : tag;
          renderNotes();
        });
      });
    } else {
      tagsFilterContainer.innerHTML = '';
    }
  }

  // Reset stale filter if tag no longer exists
  if (currentNoteFilterTag && !allTags.has(currentNoteFilterTag)) {
    currentNoteFilterTag = null;
  }

  // Filtrar notas se tiver tag ativa
  let filteredNotes = notes;
  if (currentNoteFilterTag) {
    filteredNotes = notes.filter(n => n.tags && n.tags.includes(currentNoteFilterTag));
  }

  let html = '';

  // All notes sorted by date (newest first)
  const sorted = [...filteredNotes].sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));

  sorted.forEach(note => {
    const tagsHtml = (note.tags || []).map(t => `<span class="note-tag">${DS.escapeHtml(t)}</span>`).join('');
    const noteDate = note.date || '';
    const fallbackDate = note.updatedAt || note.createdAt || '';
    const lang = state.settings?.language || 'pt-BR';
    let dateStr = '';
    if (noteDate) {
      dateStr = new Date(noteDate + 'T00:00:00').toLocaleDateString(lang, { day: '2-digit', month: '2-digit', year: 'numeric' });
    } else if (fallbackDate) {
      const d = new Date(fallbackDate);
      dateStr = d.toLocaleDateString(lang, { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
    }
    // Strip HTML tags for plain text preview (safe: regex strip, no innerHTML parse)
    const preview = ((note.content || '').replace(/<[^>]*>/g, ' ')).replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim().substring(0, 80);

    html += `
      <div class="note-card" data-note-id="${note.id}">
        <div class="note-card-header">
          <h4 class="note-card-title">${DS.escapeHtml(note.title || I18n.t('note.untitled', null, 'Sem título'))}</h4>
          <span class="note-card-date">${dateStr}</span>
        </div>
        ${preview ? `<p class="note-card-preview">${DS.escapeHtml(preview)}</p>` : ''}
        ${tagsHtml ? `<div class="note-card-tags">${tagsHtml}</div>` : ''}
      </div>
    `;
  });

  list.innerHTML = html;

  list.querySelectorAll('.note-card').forEach(card => {
    card.addEventListener('click', () => openNoteModal(card.dataset.noteId));
  });
}

function _getAllNoteTags() {
  const tags = new Set();
  (state.notes || []).forEach(n => (n.tags || []).forEach(t => tags.add(t)));
  // Include currently selected tags (new ones not yet saved)
  _selectedNoteTags.forEach(t => tags.add(t));
  return Array.from(tags).sort();
}

function _renderNoteTagSelector() {
  const container = $('#noteTagsExisting');
  const preview = $('#noteTagsSelected');
  if (!container) return;

  const allTags = _getAllNoteTags();
  container.innerHTML = allTags.map(t => {
    const sel = _selectedNoteTags.has(t) ? ' selected' : '';
    return `<button type="button" class="tag-option${sel}" data-tag="${DS.escapeHtml(t)}">${DS.escapeHtml(t)}</button>`;
  }).join('');

  container.querySelectorAll('.tag-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      if (_selectedNoteTags.has(tag)) _selectedNoteTags.delete(tag);
      else _selectedNoteTags.add(tag);
      _renderNoteTagSelector();
    });
  });

  if (preview) {
    const selected = Array.from(_selectedNoteTags);
    preview.innerHTML = selected.map(t =>
      `<span class="note-tag" data-tag="${DS.escapeHtml(t)}">${DS.escapeHtml(t)} &times;</span>`
    ).join('');
    preview.querySelectorAll('.note-tag').forEach(chip => {
      chip.addEventListener('click', () => {
        _selectedNoteTags.delete(chip.dataset.tag);
        _renderNoteTagSelector();
      });
    });
  }
}

function _addNewNoteTag() {
  const input = $('#inputNoteNewTag');
  if (!input) return;
  const tag = input.value.trim();
  if (tag && !_selectedNoteTags.has(tag)) {
    _selectedNoteTags.add(tag);
    _renderNoteTagSelector();
  }
  input.value = '';
  input.focus();
}

function openNoteModal(noteId = null) {
  editingNoteId = noteId;
  const editor = $('#inputNoteContent');
  _selectedNoteTags = new Set();

  if (noteId) {
    const note = (state.notes || []).find(n => n.id === noteId);
    if (!note) return;
    $('#modalNoteTitle').textContent = I18n.t('note.edit', null, 'Editar Nota');
    $('#inputNoteTitle').value = note.title || '';
    $('#inputNoteDate').value = note.date || '';
    editor.innerHTML = note.content || '';
    $('#btnDeleteNote').classList.remove('hidden');
    (note.tags || []).forEach(t => _selectedNoteTags.add(t));
  } else {
    $('#modalNoteTitle').textContent = I18n.t('note.new', null, 'Nova Nota');
    $('#inputNoteTitle').value = '';
    $('#inputNoteDate').value = dateKey(selectedDate);
    editor.innerHTML = '';
    $('#btnDeleteNote').classList.add('hidden');
  }

  const newTagInput = $('#inputNoteNewTag');
  if (newTagInput) newTagInput.value = '';
  _renderNoteTagSelector();
  DS.sheet.open($('#modalNote'), 0.92);
}

function closeNoteModal() { DS.sheet.close($('#modalNote')); editingNoteId = null; }

function saveNote() {
  const title = $('#inputNoteTitle').value.trim();
  const editor = $('#inputNoteContent');
  const content = editor.innerHTML.trim();
  // Treat empty editor (just <br> or whitespace) as empty
  const isEmpty = !content || content === '<br>' || !editor.textContent.trim();
  const tags = Array.from(_selectedNoteTags);
  const noteDate = $('#inputNoteDate').value || '';

  if (!title && isEmpty) {
    DS.toast(I18n.t('note.empty_warning', null, 'Adicione um título ou conteúdo'), 'warning');
    return;
  }

  if (!state.notes) state.notes = [];
  const now = new Date().toISOString();

  if (editingNoteId) {
    const note = state.notes.find(n => n.id === editingNoteId);
    if (note) {
      note.title = title;
      note.content = content;
      note.tags = tags;
      note.date = noteDate;
      note.updatedAt = now;
    }
    logAction(I18n.t('log.edited_note', { name: title }, `Nota editada: ${title}`));
  } else {
    state.notes.push({
      id: uid(),
      title,
      content,
      tags,
      date: noteDate,
      createdAt: now,
      updatedAt: now,
    });
    logAction(I18n.t('log.created_note', { name: title }, `Nota criada: ${title}`));
  }

  const isEditing = !!editingNoteId;
  Store.save(state);
  closeNoteModal();
  renderNotes();
  DS.toast(isEditing ? I18n.t('note.updated', null, 'Nota atualizada') : I18n.t('note.created', null, 'Nota criada'), 'success');
}

async function deleteNote() {
  const ok = await DS.confirm(
    I18n.t('note.delete', null, 'Excluir nota'),
    I18n.t('note.delete_msg', null, 'Tem certeza que deseja excluir esta nota?'),
    I18n.t('confirm.delete', null, 'Excluir')
  );
  if (ok) {
    const note = (state.notes || []).find(n => n.id === editingNoteId);
    if (note) logAction(I18n.t('log.deleted_note', { name: note.title }, `Nota excluída: ${note.title}`));
    state.notes = (state.notes || []).filter(n => n.id !== editingNoteId);
    Store.save(state);
    closeNoteModal();
    renderNotes();
  }
}

// ===== TABS =====
let _currentTab = 'schedule';
function initTabs() {
  const pages = {
    schedule: { show: ['#pizzaPage', '#weekNav'], hide: ['#pageAtomic', '#pageNotes', '#pageSubjects', '#pageSettings'] },
    atomic: { show: ['#pageAtomic'], hide: ['#pizzaPage', '#weekNav', '#pageNotes', '#pageSubjects', '#pageSettings'] },
    notes: { show: ['#pageNotes'], hide: ['#pizzaPage', '#weekNav', '#pageAtomic', '#pageSubjects', '#pageSettings'] },
    subjects: { show: ['#pageSubjects'], hide: ['#pizzaPage', '#weekNav', '#pageAtomic', '#pageNotes', '#pageSettings'] },
    settings: { show: ['#pageSettings'], hide: ['#pizzaPage', '#weekNav', '#pageAtomic', '#pageNotes', '#pageSubjects'] },
  };

  function switchTab(tabName, animate) {
    // Safety: ensure body scroll is unlocked when switching tabs
    if (document.body.style.overflow === 'hidden') DS.sheet.unlockBody();

    $$('.ds-tab').forEach(t => t.classList.remove('active'));
    const activeTab = [...$$('.ds-tab')].find(t => t.dataset.tab === tabName);
    if (activeTab) activeTab.classList.add('active');
    // Settings gear highlight
    const gearBtn = $('#btnHeaderSettings');
    if (gearBtn) gearBtn.classList.toggle('active', tabName === 'settings');

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
    _currentTab = tabName;
    if (tabName === 'atomic') renderAtomic();
    if (tabName === 'notes') renderNotes();
    if (tabName === 'subjects') renderSubjects();
    if (tabName === 'settings' && typeof initPriorities === 'function') initPriorities();
    try { localStorage.setItem('studyplan_tab', tabName); } catch(e) {}
  }

  // Expose globally for header gear button
  window.switchTab = switchTab;

  $$('.ds-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab, true));
  });

  // Header gear button → toggle settings
  const gearBtn = $('#btnHeaderSettings');
  if (gearBtn) {
    gearBtn.addEventListener('click', () => {
      if (_currentTab === 'settings') {
        // Return to previous non-settings tab
        const prev = localStorage.getItem('studyplan_prev_tab') || 'schedule';
        switchTab(prev, true);
      } else {
        try { localStorage.setItem('studyplan_prev_tab', _currentTab); } catch(e) {}
        switchTab('settings', true);
      }
    });
  }

  // Restore last active tab
  const saved = localStorage.getItem('studyplan_tab');
  if (saved && pages[saved]) {
    switchTab(saved, false);
  }
}

// ===== ATOMIC CHECK-IN =====
function getCheckinForDate(date) {
  const dk = dateKey(date);
  return state.checkins.records.find(r => r.date === dk) || null;
}

function getOrCreateTodayRecord() {
  const dk = dateKey(new Date());
  let rec = state.checkins.records.find(r => r.date === dk);
  if (!rec) {
    rec = { id: uid(), date: dk, morning: null, evening: null };
    state.checkins.records.push(rec);
  }
  return rec;
}

function getOrCreateTodayHabitLog() {
  const dk = dateKey(new Date());
  let rec = getCheckinForDate(new Date());
  if (!rec) {
    rec = getOrCreateTodayRecord();
  }
  if (!rec.habitLog) rec.habitLog = [];
  return rec.habitLog;
}

function setActiveGroup(buttons, activeBtn) {
  buttons.forEach(b => b.classList.remove('active'));
  activeBtn.classList.add('active');
}

function getActiveAffirmation() {
  if (!state.checkins.activeAffirmationId) return null;
  return state.checkins.affirmations.find(a => a.id === state.checkins.activeAffirmationId) || null;
}

function calculateCheckinStreak() {
  let streak = 0;
  const d = new Date();
  // If today has a complete check-in, count it; otherwise start from yesterday
  const todayRecord = getCheckinForDate(d);
  if (!todayRecord?.morning) {
    d.setDate(d.getDate() - 1);
  }
  while (true) {
    const rec = getCheckinForDate(d);
    if (rec?.morning && (rec?.evening || (rec?.habitLog?.length || 0) > 0)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function renderDailyReport() {
  const today = new Date();
  const dk = dateKey(today);
  const rec = getCheckinForDate(today);
  const m = rec?.morning;
  const e = rec?.evening;
  const hasMorning = !!m;
  const hasEvening = !!e;

  // Today's habits dynamically extracted from the agenda blocks (inactive/routine)
  const todayBlocks = state.blocks.filter(b => b.date === dk);
  const todayHabits = [];
  let totalRoutineTasks = 0;

  todayBlocks.forEach(b => {
    const s = state.subjects.find(s => s.id === b.subjectId);
    if (s?.type === 'inactive') {
      const checklist = s.checklist || [];
      totalRoutineTasks += checklist.length;
      
      checklist.forEach(item => {
        if ((b.completedItems || []).includes(item.id)) {
          const logEntry = rec?.habitLog?.find(h => h.habitId === item.id);
          todayHabits.push({
            date: dk,
            habitId: item.id,
            habitText: item.task,
            quality: logEntry?.quality || 'sharp',
            done: true
          });
        }
      });
    }
  });

  const doneCount = todayHabits.length;

  const energyLabel = { low: I18n.t('atomic.energy_low'), medium: I18n.t('atomic.energy_medium'), high: I18n.t('atomic.energy_high') };
  const moodLabel = { great: I18n.t('atomic.mood_great'), good: I18n.t('atomic.mood_good'), okay: I18n.t('atomic.mood_okay'), heavy: I18n.t('atomic.mood_heavy'), tough: I18n.t('atomic.mood_tough') };
  const confLabel = { yes: I18n.t('atomic.confirm_yes'), partial: I18n.t('atomic.confirm_partial'), no: I18n.t('atomic.confirm_no') };

  const streak = calculateCheckinStreak();

  const pct = totalRoutineTasks > 0 ? Math.round((doneCount / totalRoutineTasks) * 100) : 0;
  const pctColor = pct >= 80 ? '#34C759' : pct >= 50 ? '#FF9500' : '#FF3B30';

  const dayName = today.toLocaleDateString(I18n.locale, { weekday: 'short', day: '2-digit', month: '2-digit' });

  let html = `<div class="atomic-card atomic-daily-report">
    <div class="atomic-card-header">
      <span class="atomic-card-icon">${DS.aicon('sun', { size: 16, trigger: 'loop' })}</span>
      <span class="atomic-card-title">${I18n.t('atomic.report_title', null, 'Relatório do Dia')}</span>
      <span class="atomic-report-date">${dayName}</span>
    </div>
    <div class="atomic-report-body">`;

  // ── Morning section ──
  if (hasMorning) {
    const energyIcon = m.energy === 'high' ? 'bolt' : m.energy === 'medium' ? 'battery' : 'plug';
    html += `<div class="atomic-report-section">
      <div class="atomic-report-head">
        <span class="atomic-report-head-icon">${DS.aicon('sun', { size: 14, trigger: 'loop' })}</span>
        <span class="atomic-report-head-label">${I18n.t('atomic.morning_title', null, 'Abertura do Dia')}</span>
        <span class="atomic-report-head-status">${DS.icon('check', { size: 12 })}</span>
      </div>
      <div class="atomic-report-metrics">
        <span class="atomic-report-metric">${DS.aicon('moon', { size: 12, trigger: 'loop' })} ${m.sleepHours}h</span>
        <span class="atomic-report-metric">${DS.icon(energyIcon, { size: 12 })} ${energyLabel[m.energy] || m.energy}</span>
        <span class="atomic-report-metric">${DS.icon('star', { size: 12 })} ${moodLabel[m.mood] || m.mood}</span>
      </div>`;
    if (m.focus) html += `<div class="atomic-report-line">${DS.aicon('target', { size: 12, trigger: 'loop' })} ${DS.escapeHtml(m.focus)}</div>`;
    if (m.affirmationText) html += `<div class="atomic-report-line atomic-report-identity">${DS.icon('book-open', { size: 12 })} "${DS.escapeHtml(m.affirmationText)}"</div>`;
    html += `</div>`;
  } else {
    html += `<div class="atomic-report-section atomic-report-section--pending">
      <div class="atomic-report-head">
        <span class="atomic-report-head-icon">${DS.aicon('sun', { size: 14, trigger: 'loop' })}</span>
        <span class="atomic-report-head-label">${I18n.t('atomic.morning_title', null, 'Abertura do Dia')}</span>
        <span class="atomic-report-head-status">—</span>
      </div>
    </div>`;
  }

  // ── Habits section ──
  html += `<div class="atomic-report-section ${totalRoutineTasks > 0 && doneCount === totalRoutineTasks ? 'atomic-report-section--done' : ''}">
    <div class="atomic-report-head">
      <span class="atomic-report-head-icon">${DS.icon('check', { size: 14 })}</span>
      <span class="atomic-report-head-label">${I18n.t('common.habits', null, 'Hábitos')}</span>
      <span class="atomic-report-head-status">${doneCount}/${totalRoutineTasks}</span>
    </div>`;
  if (totalRoutineTasks > 0) {
    html += `<div class="atomic-report-progress">
      <div class="atomic-progress-bar">
        <div class="atomic-progress-fill" style="width:${pct}%;background:${pctColor};"></div>
      </div>
      <span class="atomic-progress-pct">${pct}%</span>
    </div>`;
    if (todayHabits.length > 0) {
      html += `<div class="atomic-report-habits">`;
      todayHabits.forEach(h => {
        const qual = h.quality || 'sharp';
        const qualIcon = qual === 'sharp' ? DS.icon('chevronU', { size: 12 }) : DS.icon('chevronD', { size: 12 });
        const qualColor = qual === 'sharp' ? 'var(--ds-success, #34C759)' : 'var(--ds-danger, #FF3B30)';
        html += `<span class="atomic-report-habit-tag">
          <span class="atomic-report-habit-label">${DS.escapeHtml(h.habitText)}</span>
          <span class="atomic-report-habit-qual" style="color:${qualColor}">${qualIcon}</span>
        </span>`;
      });
      html += `</div>`;
    }
  } else {
    html += `<div class="atomic-report-empty">${I18n.t('atomic.report_no_habits', null, 'Nenhum hábito configurado nas Atividades')}</div>`;
  }
  html += `</div>`;

  // ── Evening section ──
  if (hasEvening) {
    html += `<div class="atomic-report-section atomic-report-section--done">
      <div class="atomic-report-head">
        <span class="atomic-report-head-icon">${DS.aicon('moon', { size: 14, trigger: 'loop' })}</span>
        <span class="atomic-report-head-label">${I18n.t('atomic.evening_title', null, 'Encerramento do Dia')}</span>
        <span class="atomic-report-head-status">${DS.icon('check', { size: 12 })}</span>
      </div>
      <div class="atomic-report-metrics">
        <span class="atomic-report-metric">${DS.icon('book-open', { size: 12 })} ${confLabel[e.confirmed] || e.confirmed}</span>
      </div>`;
    if (e.recharged) html += `<div class="atomic-report-line">${DS.icon('battery', { size: 12 })} ${DS.escapeHtml(e.recharged)}</div>`;
    if (e.drained) html += `<div class="atomic-report-line">${DS.icon('plug', { size: 12 })} ${DS.escapeHtml(e.drained)}</div>`;
    if (e.nextVote?.action) html += `<div class="atomic-report-line">${DS.aicon('sun', { size: 12, trigger: 'loop' })} ${DS.escapeHtml(e.nextVote.action)}${e.nextVote.time ? ' ' + I18n.t('atomic.report_at', null, 'às') + ' ' + e.nextVote.time : ''}</div>`;
    html += `</div>`;
  } else if (hasMorning) {
    html += `<div class="atomic-report-section atomic-report-section--pending">
      <div class="atomic-report-head">
        <span class="atomic-report-head-icon">${DS.aicon('moon', { size: 14, trigger: 'loop' })}</span>
        <span class="atomic-report-head-label">${I18n.t('atomic.evening_title', null, 'Encerramento do Dia')}</span>
        <span class="atomic-report-head-status">${I18n.t('atomic.report_pending', null, 'pendente')}</span>
      </div>
    </div>`;
  }

  // ── Streak footer ──
  if (streak > 0) {
    html += `<div class="atomic-report-footer">
      <span class="atomic-report-streak">${DS.aicon('flame', { size: 16, trigger: 'loop' })}</span>
      <span class="atomic-report-streak-count">${streak}</span>
      <span class="atomic-report-streak-label">${I18n.t('atomic.streak_label', null, 'dias consecutivos')}</span>
    </div>`;
  }

  html += `</div></div>`;
  return html;
}

function renderAtomic() {
  const container = $('#atomicContent');
  if (!container) return;
  const today = new Date();
  const dk = dateKey(today);
  const record = getCheckinForDate(today) || {};
  const hasMorning = !!record.morning;
  const hasEvening = !!record.evening;
  const affirmation = getActiveAffirmation();
  const streak = calculateCheckinStreak();

  let html = '';

  // ── Empty state ──
  if (!affirmation && streak === 0) {
    html += `<div class="atomic-empty-state">
      <span class="atomic-empty-icon">
${DS.icon('user', { size: 28, strokeWidth: 1.8 })}
      </span>
      <p class="atomic-empty-title">${I18n.t('atomic.no_affirmation', null, 'Defina sua identidade para começar')}</p>
      <p class="atomic-empty-hint">Preencha o check-in abaixo com <strong>"quem você quer ser hoje"</strong> — sua identidade para o dia.</p>
    </div>`;
  }

  // ── Streak badge ──
  if (streak > 0) {
    html += `<div class="atomic-streak">
      <span class="atomic-streak-fire">${DS.aicon('flame', { size: 20, trigger: 'loop' })}</span>
      <span class="atomic-streak-count">${streak}</span>
      <span class="atomic-streak-label">${I18n.t('atomic.streak_label', null, 'dias consecutivos')}</span>
    </div>`;
  }

  // ── Morning Check-in ──
  html += `<div class="atomic-card ${hasMorning ? 'atomic-card--done' : ''}">`;
  html += `<div class="atomic-card-header">
    <span class="atomic-card-icon">${DS.aicon('sun', { size: 18, trigger: 'loop' })}</span>
    <span class="atomic-card-title">${I18n.t('atomic.morning_title', null, 'Abertura do Dia')}</span>
    ${hasMorning ? `<span class="atomic-card-check">${DS.icon('check', { size: 16 })}</span>` : ''}
  </div>`;

  if (hasMorning) {
    const m = record.morning;
    const energyMap = { low: I18n.t('atomic.energy_low'), medium: I18n.t('atomic.energy_medium'), high: I18n.t('atomic.energy_high') };
    const moodMap = { great: I18n.t('atomic.mood_great'), good: I18n.t('atomic.mood_good'), okay: I18n.t('atomic.mood_okay'), heavy: I18n.t('atomic.mood_heavy'), tough: I18n.t('atomic.mood_tough') };
    html += `<div class="atomic-card-summary">
      <div class="atomic-summary-row"><span>${DS.aicon('moon', { size: 16, trigger: 'loop' })}</span><span>${m.sleepHours}h ${I18n.t('atomic.sleep_label')}</span></div>
      <div class="atomic-summary-row"><span>${DS.aicon('bolt', { size: 16, trigger: 'loop' })}</span><span>${energyMap[m.energy] || m.energy}</span></div>
      ${m.mood ? `<div class="atomic-summary-row"><span>${DS.aicon('flame', { size: 16, trigger: 'loop' })}</span><span>${moodMap[m.mood] || m.mood}</span></div>` : ''}
      ${m.affirmationText ? `<div class="atomic-summary-row"><span>${DS.icon('book-open', { size: 16 })}</span><span>"${m.affirmationText}"</span></div>` : ''}
      ${m.focus ? `<div class="atomic-summary-row"><span>${DS.aicon('target', { size: 16, trigger: 'loop' })}</span><span>${m.focus}</span></div>` : ''}
    </div>`;
  } else {
    // Morning form
    const prefill = affirmation?.text || '';
    html += `<div class="atomic-card-form" id="atomicMorningForm">
      <div class="atomic-gauges-row">
        <div class="atomic-field atomic-field--sleep">
          <label class="ds-label" style="display:flex; align-items:center; gap:4px;">
            <span>${DS.aicon('moon', { size: 16, trigger: 'loop' })} ${I18n.t('atomic.sleep_label', null, 'Sono')}</span>
            <button type="button" class="atomic-help-btn" data-help="sleep" aria-label="Ajuda">${DS.icon('info', { size: 14 })}</button>
          </label>
          <div class="sleep-dial" id="sleepDial">
            <svg class="sleep-dial-svg" viewBox="0 0 160 160">
              <circle cx="80" cy="80" r="58" fill="none" stroke="var(--ds-fill-tertiary)" stroke-width="12" opacity="0.5"/>
              <circle class="sleep-dial-fill" id="sleepDialFill" cx="80" cy="80" r="58" fill="none" stroke="var(--ds-accent)" stroke-width="12" stroke-linecap="round"
                stroke-dasharray="${2 * Math.PI * 58}" stroke-dashoffset="${2 * Math.PI * 58 * (1 - 3/8)}"
                transform="rotate(-90 80 80)" style="transition: stroke-dashoffset 0.4s var(--ds-ease-spring);"/>
              <text x="80" y="72" text-anchor="middle" class="sleep-dial-num" fill="var(--ds-text-primary)">7</text>
              <text x="80" y="96" text-anchor="middle" class="sleep-dial-unit" fill="var(--ds-text-tertiary)">${I18n.t('atomic.sleep_label', null, 'Sono')}</text>
            </svg>
            <div class="sleep-dial-controls">
              <button type="button" class="sleep-dial-btn" id="sleepMinus" aria-label="Menos">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
              <button type="button" class="sleep-half-toggle" id="sleepHalfToggle">+30min</button>
              <button type="button" class="sleep-dial-btn" id="sleepPlus" aria-label="Mais">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
            </div>
            <input type="hidden" id="atomicSleep" value="7">
          </div>
        </div>
        <div class="atomic-field atomic-field--mood">
          <label class="ds-label" style="display:flex; align-items:center; gap:4px;">
            <span>${DS.aicon('flame', { size: 16, trigger: 'loop' })} ${I18n.t('atomic.mood_label', null, 'Humor')}</span>
            <button type="button" class="atomic-help-btn" data-help="mood" aria-label="Ajuda">${DS.icon('info', { size: 14 })}</button>
          </label>
          <div class="mood-pizza" id="moodPizza">
            <svg class="mood-pizza-svg" viewBox="0 0 160 160">
              ${(() => {
                const moods = [
                  { val: 'great', label: I18n.t('atomic.mood_great', null, 'Energizado'), color: '#34C759' },
                  { val: 'good',  label: I18n.t('atomic.mood_good', null, 'Bem'),        color: '#8BC34A' },
                  { val: 'okay',  label: I18n.t('atomic.mood_okay', null, 'Neutro'),      color: '#FF9500' },
                  { val: 'heavy', label: I18n.t('atomic.mood_heavy', null, 'Pesado'),     color: '#FF6B35' },
                  { val: 'tough', label: I18n.t('atomic.mood_tough', null, 'Difícil'),    color: '#FF3B30' },
                ];
                const cx = 80, cy = 80, R = 62, r = 0;
                const n = moods.length;
                const sliceAngle = (2 * Math.PI) / n;
                return moods.map((m, i) => {
                  const a1 = -Math.PI / 2 + i * sliceAngle;
                  const a2 = a1 + sliceAngle;
                  const ox1 = cx + R * Math.cos(a1), oy1 = cy + R * Math.sin(a1);
                  const ox2 = cx + R * Math.cos(a2), oy2 = cy + R * Math.sin(a2);
                  const ix1 = cx + r * Math.cos(a1), iy1 = cy + r * Math.sin(a1);
                  const ix2 = cx + r * Math.cos(a2), iy2 = cy + r * Math.sin(a2);
                  const path = 'M '+ix1+' '+iy1+' L '+ox1+' '+oy1+' A '+R+' '+R+' 0 0 1 '+ox2+' '+oy2+' L '+ix2+' '+iy2+' A '+r+' '+r+' 0 0 0 '+ix1+' '+iy1+' Z';
                  return '<path class="mood-slice'+(i===0?' active':'')+'" d="'+path+'" fill="'+m.color+'" data-val="'+m.val+'" style="cursor:pointer;"/>';
                }).join('');
              })()}

            </svg>
            <div class="mood-selected-label" id="moodSelectedLabel">${I18n.t('atomic.mood_great', null, 'Energizado')}</div>
          </div>
        </div>
      </div>
      <div class="atomic-field">
        <label class="ds-label">${DS.aicon('bolt', { size: 16, trigger: 'loop' })} ${I18n.t('atomic.energy_label', null, 'Energia')} <button type="button" class="atomic-help-btn" data-help="energy" aria-label="Ajuda">${DS.icon('info', { size: 14 })}</button></label>
        <div class="atomic-energy-btns" id="atomicEnergyBtns">
          <button type="button" class="atomic-energy-btn" data-val="low">${I18n.t('atomic.energy_low', null, 'Baixa')}</button>
          <button type="button" class="atomic-energy-btn active" data-val="medium">${I18n.t('atomic.energy_medium', null, 'Média')}</button>
          <button type="button" class="atomic-energy-btn" data-val="high">${I18n.t('atomic.energy_high', null, 'Alta')}</button>
        </div>
      </div>
      <div class="atomic-field">
        <label class="ds-label">${DS.icon('book-open', { size: 16 })} ${I18n.t('atomic.identity_prompt', null, 'Hoje eu sou…')} <button type="button" class="atomic-help-btn" data-help="identity" aria-label="Ajuda">${DS.icon('info', { size: 14 })}</button></label>
        <input type="text" id="atomicIdentity" class="ds-input" value="${DS.escapeHtml(prefill)}" placeholder="${I18n.t('atomic.identity_placeholder', null, 'a pessoa que estuda todos os dias')}">
      </div>
      <div class="atomic-field">
        <label class="ds-label">${DS.aicon('target', { size: 16, trigger: 'loop' })} ${I18n.t('atomic.focus_label', null, 'O essencial de hoje')} <button type="button" class="atomic-help-btn" data-help="focus" aria-label="Ajuda">${DS.icon('info', { size: 14 })}</button></label>
        <input type="text" id="atomicFocus" class="ds-input" placeholder="${I18n.t('atomic.focus_placeholder', null, 'abrir o material e ler 1 questão')}">
      </div>
      <button class="ds-btn ds-btn-filled ds-btn-block atomic-confirm-btn" id="btnConfirmMorning">
        ${I18n.t('atomic.confirm_morning', null, 'Confirmar e começar o dia')}
      </button>
    </div>`;
  }
  html += `</div>`; // end morning card

  // ── Evening Check-in ──
  html += `<div class="atomic-card ${hasEvening ? 'atomic-card--done' : ''} ${!hasMorning ? 'atomic-card--locked' : ''}">`;
  html += `<div class="atomic-card-header">
    <span class="atomic-card-icon">${DS.aicon('moon', { size: 18, trigger: 'loop' })}</span>
    <span class="atomic-card-title">${I18n.t('atomic.evening_title', null, 'Encerramento do Dia')}</span>
    ${hasEvening ? `<span class="atomic-card-check">${DS.icon('check', { size: 16 })}</span>` : ''}
  </div>`;

      if (!hasMorning) {
    html += `<div class="atomic-card-locked-msg" aria-live="polite">${I18n.t('atomic.evening_locked', null, 'Complete o check-in da manhã primeiro')}</div>`;
  } else if (hasEvening) {
    const e = record.evening;
    const confMap = { yes: I18n.t('atomic.confirm_yes'), partial: I18n.t('atomic.confirm_partial'), no: I18n.t('atomic.confirm_no') };
    html += `<div class="atomic-card-summary">
      <div class="atomic-summary-row"><span>${DS.icon('book-open', { size: 16 })}</span><span>${confMap[e.confirmed] || e.confirmed}</span></div>
      ${e.recharged ? `<div class="atomic-summary-row"><span>${DS.icon('battery', { size: 16 })}</span><span>${e.recharged}</span></div>` : ''}
      ${e.drained ? `<div class="atomic-summary-row"><span>${DS.icon('plug', { size: 16 })}</span><span>${e.drained}</span></div>` : ''}
      ${e.nextVote?.action ? `<div class="atomic-summary-row"><span>${DS.aicon('sun', { size: 14, trigger: 'loop' })}</span><span>${e.nextVote.action}${e.nextVote.time ? ' ' + I18n.t('atomic.next_vote_time') + ' ' + e.nextVote.time : ''}</span></div>` : ''}
    </div>`;
  } else {
    // Evening form
    // Today's habits summary from agenda blocks (with quality toggles)
    const todayKey = dateKey(new Date());
    const recToday = getCheckinForDate(new Date());
    const todayBlocks = state.blocks.filter(b => b.date === todayKey);
    const todayHabits = [];
    
    todayBlocks.forEach(b => {
      const s = state.subjects.find(s => s.id === b.subjectId);
      if (s?.type === 'inactive') {
        (s.checklist || []).forEach(item => {
          if ((b.completedItems || []).includes(item.id)) {
            const logEntry = recToday?.habitLog?.find(h => h.habitId === item.id);
            todayHabits.push({
              date: todayKey,
              habitId: item.id,
              habitText: item.task,
              quality: logEntry?.quality || 'sharp'
            });
          }
        });
      }
    });

    if (todayHabits.length > 0) {
      html += `<div class="atomic-habits-summary">
        <div class="ds-label">${DS.icon('check', { size: 14 })} ${I18n.t('atomic.habits_done', null, 'Hábitos de hoje')}</div>
        <div class="atomic-habits-quality-list" id="atomicHabitsQuality">`;
      todayHabits.forEach(h => {
        const qual = h.quality || 'sharp';
        html += `<div class="atomic-habit-quality-row" data-habit-id="${DS.escapeHtml(h.habitId)}">
          <span class="atomic-habit-quality-label">${DS.escapeHtml(h.habitText)}</span>
          <span class="atomic-habit-quality-btns">
            <button type="button" class="atomic-quality-btn ${qual === 'sharp' ? 'active' : ''}" data-val="sharp" title="${I18n.t('atomic.quality_sharp', null, 'Sustenido — bem executado')}">${DS.icon('chevronU', { size: 16 })}</button>
            <button type="button" class="atomic-quality-btn ${qual === 'flat' ? 'active' : ''}" data-val="flat" title="${I18n.t('atomic.quality_flat', null, 'Bemol — abaixo do esperado')}">${DS.icon('chevronD', { size: 16 })}</button>
          </span>
        </div>`;
      });
      html += `</div></div>`;
    }
    html += `<div class="atomic-card-form" id="atomicEveningForm">
      <div class="atomic-field">
        <label class="ds-label">${DS.icon('book-open', { size: 16 })} ${I18n.t('atomic.confirmed_identity', null, 'Confirmei minha identidade?')} <button type="button" class="atomic-help-btn" data-help="confirmation" aria-label="Ajuda">${DS.icon('info', { size: 14 })}</button></label>
        <div class="atomic-confirm-btns" id="atomicConfirmBtns">
          <button type="button" class="atomic-confirm-opt" data-val="yes">${I18n.t('atomic.confirm_yes', null, 'Sim')}</button>
          <button type="button" class="atomic-confirm-opt" data-val="partial">${I18n.t('atomic.confirm_partial', null, 'Em parte')}</button>
          <button type="button" class="atomic-confirm-opt" data-val="no">${I18n.t('atomic.confirm_no', null, 'Não')}</button>
        </div>
      </div>
      <div class="atomic-field">
        <label class="ds-label">${DS.icon('battery', { size: 16 })} ${I18n.t('atomic.recharged_label', null, 'O que me recarregou')} <button type="button" class="atomic-help-btn" data-help="recharged" aria-label="Ajuda">${DS.icon('info', { size: 14 })}</button></label>
        <input type="text" id="atomicRecharged" class="ds-input" placeholder="${I18n.t('atomic.recharged_placeholder', null, 'Ex: caminhada, boa conversa…')}">
      </div>
      <div class="atomic-field">
        <label class="ds-label">${DS.icon('plug', { size: 16 })} ${I18n.t('atomic.drained_label', null, 'O que me drenou')} <button type="button" class="atomic-help-btn" data-help="drained" aria-label="Ajuda">${DS.icon('info', { size: 14 })}</button></label>
        <input type="text" id="atomicDrained" class="ds-input" placeholder="${I18n.t('atomic.drained_placeholder', null, 'Ex: reunião longa, insônia…')}">
      </div>
      <div class="atomic-field">
        <label class="ds-label">${DS.aicon('sun', { size: 16, trigger: 'loop' })} ${I18n.t('atomic.next_vote_label', null, 'Primeiro voto de amanhã')} <button type="button" class="atomic-help-btn" data-help="nextvote" aria-label="Ajuda">${DS.icon('info', { size: 14 })}</button></label>
        <div class="atomic-next-vote-row">
          <input type="text" id="atomicNextVote" class="ds-input" placeholder="${I18n.t('atomic.next_vote_placeholder', null, 'Ex: revisar flashcards')}" style="flex:1">
          <span class="atomic-next-vote-at">${I18n.t('atomic.next_vote_time', null, 'às')}</span>
          <input type="time" id="atomicNextVoteTime" class="ds-input" value="07:00" style="width:90px">
        </div>
      </div>
      <button class="ds-btn ds-btn-filled ds-btn-block atomic-confirm-btn" id="btnConfirmEvening">
        ${I18n.t('atomic.confirm_evening', null, 'Registrar e encerrar dia')}
      </button>
    </div>`;
  }
  html += `</div>`; // end evening card

  // ── Daily Report ──
  html += renderDailyReport();

  // ── Timeline ──
  html += `<div class="atomic-timeline">`;
  html += `<h3 class="atomic-timeline-title">${I18n.t('atomic.timeline_title', null, 'Linha do Tempo')}</h3>`;
  html += `<div class="atomic-timeline-grid">`;
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    const rec = getCheckinForDate(d);
    const isToday = dateKey(d) === dk;
    const dayLabel = d.toLocaleDateString(I18n.locale, { weekday: 'short' }).slice(0, 3);
    const mornDone = rec?.morning ? `<span class="atomic-tl-sun">${DS.aicon('sun', { size: 10, trigger: 'loop' })}</span>` : '';
    const eveDone = rec?.evening ? `<span class="atomic-tl-moon">${DS.aicon('moon', { size: 10, trigger: 'loop' })}</span>` : '';
    html += `<div class="atomic-timeline-day ${isToday ? 'atomic-timeline-day--today' : ''} ${rec?.morning ? 'atomic-timeline-day--has' : ''}">
      <span class="atomic-timeline-indicators">${mornDone}${eveDone}</span>
      <span class="atomic-timeline-date">${d.getDate()}</span>
      <span class="atomic-timeline-label">${dayLabel}</span>
    </div>`;
  }
  html += `</div>`; // end grid

  // Active affirmation display
  if (affirmation) {
    const since = new Date(affirmation.createdAt).toLocaleDateString(I18n.locale, { day: '2-digit', month: '2-digit' });
    html += `<div class="atomic-affirmation-display">
      <span class="atomic-affirmation-quote">"${DS.escapeHtml(affirmation.text)}"</span>
      <span class="atomic-affirmation-since">— ${I18n.t('atomic.since', null, 'desde')} ${since}</span>
    </div>`;
  }
  html += `</div>`; // end timeline

  // ── Weekly Insights Dashboard ──
  html += `<div class="atomic-insights">
    <h3 class="atomic-timeline-title">${DS.icon('info', { size: 16 })} ${I18n.t('atomic.insights_title', null, 'Insights da Semana')}</h3>
    <div class="atomic-insights-grid">`;

  // Mood chart: 7 colored circles
  html += `<div class="atomic-insights-card">
    <div class="ds-label">${DS.aicon('flame', { size: 14, trigger: 'loop' })} ${I18n.t('atomic.insights_mood', null, 'Humor')}</div>
    <div class="atomic-mood-chart">`;
  const moodColors = { great: '#34C759', good: '#8BC34A', okay: '#FF9500', heavy: '#FF6B35', tough: '#FF3B30' };
  const moodLabels = { great: I18n.t('atomic.mood_great'), good: I18n.t('atomic.mood_good'), okay: I18n.t('atomic.mood_okay'), heavy: I18n.t('atomic.mood_heavy'), tough: I18n.t('atomic.mood_tough') };
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    const rec = getCheckinForDate(d);
    const isToday = dateKey(d) === dk;
    const mood = rec?.morning?.mood;
    const dayLabel = d.toLocaleDateString(I18n.locale, { weekday: 'short' }).slice(0, 3);
    html += `<div class="atomic-mood-day ${isToday ? 'atomic-mood-day--today' : ''}" title="${dayLabel}: ${mood ? (moodLabels[mood] || mood) : '—'}">
      <span class="atomic-mood-dot" style="${mood ? `background:${moodColors[mood] || '#ddd'};` : 'background:#eee;'}${isToday ? 'box-shadow:0 0 0 2px var(--ds-primary);' : ''}"></span>
      <span class="atomic-mood-day-label">${dayLabel}</span>
    </div>`;
  }
  html += `</div></div>`;

  // Habit completion stats
  html += `<div class="atomic-insights-card">
    <div class="ds-label">${DS.aicon('checkCircle', { size: 14, trigger: 'loop' })} ${I18n.t('atomic.insights_habits', null, 'Hábitos')}</div>
    <div class="atomic-habits-chart">`;
  let totalWeekHabits = 0;
  let doneWeekHabits = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    const rec = getCheckinForDate(d);
    const dayHabits = rec?.habitLog?.filter(h => h.date === dateKey(d)) || [];
    totalWeekHabits += dayHabits.length;
    doneWeekHabits += dayHabits.filter(h => h.quality !== 'flat').length;
  }
  const pct = totalWeekHabits > 0 ? Math.round((doneWeekHabits / totalWeekHabits) * 100) : 0;
  const barColor = pct >= 80 ? '#34C759' : pct >= 50 ? '#FF9500' : '#FF3B30';
  html += `<div class="atomic-habits-stat">
    <span class="atomic-habits-stat-num">${doneWeekHabits}/${totalWeekHabits}</span>
    <span class="atomic-habits-stat-label">${I18n.t('atomic.insights_completed', null, 'executados')}</span>
  </div>
  <div class="atomic-progress-bar">
    <div class="atomic-progress-fill" style="width:${pct}%;background:${barColor};"></div>
  </div>
  <span class="atomic-progress-pct">${pct}%</span>`;

  html += `</div></div>`;

  // Mood streak
  let moodStreak = 0;
  const d = new Date();
  const todayRec = getCheckinForDate(d);
  if (!todayRec?.morning) d.setDate(d.getDate() - 1);
  while (true) {
    const rec = getCheckinForDate(d);
    if (rec?.morning?.mood) {
      moodStreak++;
      d.setDate(d.getDate() - 1);
    } else break;
  }
  if (moodStreak > 0) {
    html += `<div class="atomic-insights-card">
      <div class="ds-label">${DS.aicon('flame', { size: 14, trigger: 'loop' })} ${I18n.t('atomic.insights_mood_streak', null, 'Humor consecutivo')}</div>
      <div class="atomic-insights-streak">
        <span class="atomic-insights-streak-num">${moodStreak}</span>
        <span class="atomic-insights-streak-label">${I18n.t('atomic.streak_label', null, 'dias consecutivos')}</span>
      </div>
    </div>`;
  }

  html += `</div></div>`; // end insights grid and insights container

  container.innerHTML = html;
  updateAtomicTabIcon();

  // ── Locked card: disable keyboard focus ──
  const lockedForm = container.querySelector('#atomicEveningForm');
  if (!hasMorning && lockedForm) {
    lockedForm.querySelectorAll('input, button, textarea, select').forEach(el => {
      el.tabIndex = -1;
      el.setAttribute('aria-disabled', 'true');
    });
  }

  // ── Event bindings ──
  // Sleep Dial
  const sleepInput = $('#atomicSleep');
  const sleepDialFill = $('#sleepDialFill');
  if (sleepInput && sleepDialFill) {
    const circumference = 2 * Math.PI * 58;
    const halfToggle = $('#sleepHalfToggle');
    let baseHours = 7;
    let hasHalf = false;

    function updateSleepDial() {
      const total = baseHours + (hasHalf ? 0.5 : 0);
      sleepInput.value = total;
      // Update center text
      const numEl = sleepDialFill.closest('svg').querySelector('.sleep-dial-num');
      const unitEl = sleepDialFill.closest('svg').querySelector('.sleep-dial-unit');
      if (numEl) numEl.textContent = hasHalf ? total : baseHours;
      if (unitEl) unitEl.textContent = I18n.t('atomic.sleep_label', null, 'Sono');
      // Update arc fill (4-12h range → 0-100%)
      const fraction = (total - 4) / 8;
      sleepDialFill.style.strokeDashoffset = circumference * (1 - Math.max(0, Math.min(1, fraction)));
    }

    // +/- buttons
    const btnMinus = $('#sleepMinus');
    const btnPlus = $('#sleepPlus');
    if (btnMinus) btnMinus.addEventListener('click', () => {
      if (baseHours > 4) { baseHours--; updateSleepDial(); if (navigator.vibrate) navigator.vibrate(10); }
    });
    if (btnPlus) btnPlus.addEventListener('click', () => {
      if (baseHours < 12) { baseHours++; updateSleepDial(); if (navigator.vibrate) navigator.vibrate(10); }
    });

    // Touch drag on dial ring
    const dialSvg = sleepDialFill.closest('svg');
    if (dialSvg) {
      function handleDialTouch(e) {
        const rect = dialSvg.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const touch = e.touches ? e.touches[0] : e;
        const angle = Math.atan2(touch.clientY - cy, touch.clientX - cx);
        // Convert angle to fraction (top = 0, clockwise)
        let frac = (angle + Math.PI / 2) / (2 * Math.PI);
        if (frac < 0) frac += 1;
        const hours = Math.round(4 + frac * 8);
        const clamped = Math.max(4, Math.min(12, hours));
        if (clamped !== baseHours) {
          baseHours = clamped;
          updateSleepDial();
          if (navigator.vibrate) navigator.vibrate(10);
        }
      }
      let dragging = false;
      dialSvg.addEventListener('pointerdown', (e) => { dragging = true; handleDialTouch(e); });
      dialSvg.addEventListener('pointermove', (e) => { if (dragging) handleDialTouch(e); });
      dialSvg.addEventListener('pointerup', () => { dragging = false; });
      dialSvg.addEventListener('pointerleave', () => { dragging = false; });
    }

    if (halfToggle) {
      halfToggle.addEventListener('click', () => {
        hasHalf = !hasHalf;
        halfToggle.classList.toggle('active', hasHalf);
        updateSleepDial();
        if (navigator.vibrate) navigator.vibrate(10);
      });
    }

    updateSleepDial();
  }

  // Energy buttons
  const energyBtns = container.querySelectorAll('.atomic-energy-btn');
  energyBtns.forEach(btn => {
    btn.addEventListener('click', () => setActiveGroup(energyBtns, btn));
  });

  // Mood pizza
  const moodSlices = container.querySelectorAll('.mood-slice');
  const moodSelectedLabel = container.querySelector('.mood-selected-label');
  moodSlices.forEach(slice => {
    slice.addEventListener('click', () => {
      moodSlices.forEach(s => s.classList.remove('active'));
      slice.classList.add('active');
      // Update center label
      const moodLabels = { great: I18n.t('atomic.mood_great', null, 'Energizado'), good: I18n.t('atomic.mood_good', null, 'Bem'), okay: I18n.t('atomic.mood_okay', null, 'Neutro'), heavy: I18n.t('atomic.mood_heavy', null, 'Pesado'), tough: I18n.t('atomic.mood_tough', null, 'Difícil') };
      if (moodSelectedLabel) moodSelectedLabel.textContent = moodLabels[slice.dataset.val] || '';
      if (navigator.vibrate) navigator.vibrate(10);
    });
  });

  // Confirm buttons (evening)
  const confirmBtns = container.querySelectorAll('.atomic-confirm-opt');
  confirmBtns.forEach(btn => {
    btn.addEventListener('click', () => setActiveGroup(confirmBtns, btn));
  });

  // Habit quality buttons (evening)
  const qualityContainer = document.getElementById('atomicHabitsQuality');
  if (qualityContainer) {
    qualityContainer.querySelectorAll('.atomic-quality-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = btn.closest('.atomic-habit-quality-row');
        if (!row) return;
        const habitId = row.dataset.habitId;
        const val = btn.dataset.val;
        // Update UI
        row.querySelectorAll('.atomic-quality-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // Save quality to state
        const rec = getCheckinForDate(new Date());
        if (rec) {
          if (!rec.habitLog) rec.habitLog = [];
          let entry = rec.habitLog.find(h => h.habitId === habitId && h.date === dateKey(new Date()));
          if (!entry) {
            const taskLabel = row.querySelector('.atomic-habit-quality-label')?.textContent || habitId;
            entry = { date: dateKey(new Date()), habitId, habitText: taskLabel, done: true, quality: val };
            rec.habitLog.push(entry);
          } else {
            entry.quality = val;
          }
          Store.save(state);
        }
      });
    });
  }

  // Field help buttons
  container.querySelectorAll('.atomic-help-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const help = btn.dataset.help;
      const titles = {
        sleep: I18n.t('atomic.help_sleep_title', null, 'Sono'),
        energy: I18n.t('atomic.help_energy_title', null, 'Energia'),
        mood: I18n.t('atomic.help_mood_title', null, 'Humor'),
        identity: I18n.t('atomic.help_identity_title', null, 'Afirmação de Identidade'),
        focus: I18n.t('atomic.help_focus_title', null, 'Foco'),
        confirmation: I18n.t('atomic.help_confirmation_title', null, 'Confirmação'),
        recharged: I18n.t('atomic.help_recharged_title', null, 'Recarga'),
        drained: I18n.t('atomic.help_drained_title', null, 'Drenagem'),
        nextvote: I18n.t('atomic.help_nextvote_title', null, 'Primeiro Voto')
      };
      const bodies = {
        sleep: I18n.t('atomic.help_sleep_body', null, 'Quantas horas de sono você teve hoje? <em>7-8h</em> é o ideal para adultos. Menos de 6h pode afetar sua cognição.'),
        energy: I18n.t('atomic.help_energy_body', null, 'Como está sua energia agora? <br><strong>Alta</strong> — pronto para qualquer desafio<br><strong>Média</strong> — funciona, mas sem brilho<br><strong>Baixa</strong> — precisa de recuperação'),
        mood: I18n.t('atomic.help_mood_body', null, 'Como você está se sentindo? <br><strong>Ótimo</strong> — animado, grato<br><strong>Ok</strong> — neutro, estável<br><strong>Pesado</strong> — cansado, irritado, ansioso'),
        identity: I18n.t('atomic.help_identity_body', null, 'Escreva uma afirmação curta de identidade no presente. <br><em>"Hoje eu sou consistente."</em> <br><em>"Hoje eu sou curioso."</em> <br>Isso ancora seu comportamento no dia.'),
        focus: I18n.t('atomic.help_focus_body', null, 'Qual é a <strong>única coisa</strong> que precisa acontecer hoje? <br>Se nada mais for feito, isso precisa estar feito.'),
        confirmation: I18n.t('atomic.help_confirmation_body', null, 'Você agiu alinhado à sua afirmação de identidade hoje?<br><strong>Sim</strong> — viveu o propósito<br><strong>Em parte</strong> — tentou, mas escorregou<br><strong>Não</strong> — deixou passar'),
        recharged: I18n.t('atomic.help_recharged_body', null, 'O que te deu energia hoje? <br>Pode ser uma pessoa, uma atividade, um momento de descanso. Reconhecer recargas ajuda a repeti-las.'),
        drained: I18n.t('atomic.help_drained_body', null, 'O que te tirou energia hoje? <br>Identificar drenos ajuda a evitá-los ou preparar-se para eles.'),
        nextvote: I18n.t('atomic.help_nextvote_body', null, 'Qual será seu <strong>primeiro compromisso</strong> amanhã? <br>Definir o primeiro voto cria momentum. Um bloco será criado automaticamente na agenda de amanhã.')
      };
      showFieldHelp(titles[help] || help, bodies[help] || '');
    });
  });

  // Morning submit
  const btnMorning = $('#btnConfirmMorning');
  if (btnMorning) {
    btnMorning.addEventListener('click', () => {
      const sleepVal = parseFloat($('#atomicSleep')?.value || '7');
      const energyBtn = container.querySelector('.atomic-energy-btn.active');
      const energy = energyBtn?.dataset.val || 'medium';
      const moodSlice = container.querySelector('.mood-slice.active');
      const mood = moodSlice?.dataset.val || 'okay';
      const identityText = $('#atomicIdentity')?.value?.trim() || '';
      const focus = $('#atomicFocus')?.value?.trim() || '';

      // Save or update affirmation — always create a new version for today
      if (identityText) {
        const todayStr = dk;
        const existing = state.checkins.affirmations.find(
          a => a.text === identityText && !a.retiredAt && a.createdAt === todayStr
        );
        if (!existing) {
          const aff = { id: uid(), text: identityText, version: state.checkins.affirmations.length + 1, createdAt: dateKey(new Date()), retiredAt: null };
          state.checkins.affirmations.push(aff);
          state.checkins.activeAffirmationId = aff.id;
        } else {
          state.checkins.activeAffirmationId = existing.id;
        }
      }

      // Save morning record
      let rec = getOrCreateTodayRecord();
      rec.morning = {
        sleepHours: sleepVal,
        energy,
        mood,
        affirmationText: identityText,
        focus,
        timestamp: new Date().toISOString()
      };

      if (Store.save(state)) {
        logAction(I18n.t('atomic.morning_done', null, 'Manhã registrada'));
        DS.toast(I18n.t('atomic.morning_done', null, 'Manhã registrada') + ' ✓');
        renderAtomic();
        updateAtomicTabIcon();

        // Offer to create focus block
        if (focus) {
          const now = new Date();
          const h = String(now.getHours()).padStart(2, '0');
          const m = String(now.getMinutes()).padStart(2, '0');
          DS.toast(
            `<span style="display:flex;align-items:center;gap:8px">
              <span>${DS.aicon('target', { size: 14, trigger: 'loop' })} Criar bloco para "${focus}" agora?</span>
              <button class="ds-btn ds-btn-sm ds-btn-filled" id="toastCreateFocusBlock" style="font-size:12px;padding:2px 10px">Sim</button>
            </span>`,
            'info', 10000
          );
          setTimeout(() => {
            const btn = document.getElementById('toastCreateFocusBlock');
            if (btn) {
              btn.addEventListener('click', () => {
                const endIdx = (parseInt(h) + 1) % 24;
                const endStr = String(endIdx).padStart(2, '0') + ':' + m;
                state.blocks.push({
                  id: uid(), date: dateKey(new Date()),
                  subjectId: null,
                  topic: focus,
                  start: h + ':' + m,
                  end: endStr,
                  done: false,
                  completedItems: []
                });
                Store.save(state);
                render();
                DS.toast(I18n.t('block.created'), 'success');
              });
            }
          }, 100);
        }
      } else {
        DS.toast('Erro ao salvar', 'error');
      }
    });
  }

  // Evening submit
  const btnEvening = $('#btnConfirmEvening');
  if (btnEvening) {
    btnEvening.addEventListener('click', () => {
      const confirmBtn = container.querySelector('.atomic-confirm-opt.active');
      const confirmed = confirmBtn?.dataset.val || 'partial';
      const recharged = $('#atomicRecharged')?.value?.trim() || '';
      const drained = $('#atomicDrained')?.value?.trim() || '';
      const nextAction = $('#atomicNextVote')?.value?.trim() || '';
      const nextTime = $('#atomicNextVoteTime')?.value || '';

      let rec = getCheckinForDate(new Date());
      if (!rec) return;
      rec.evening = {
        confirmed,
        recharged,
        drained,
        nextVote: { action: nextAction, time: nextTime },
        timestamp: new Date().toISOString()
      };

      // Ensure all today's habits have quality set
      const todayKey = dateKey(new Date());
      const habitLog = rec.habitLog || [];
      habitLog.forEach(h => {
        if (h.date === todayKey && !h.quality) {
          h.quality = 'sharp';
        }
      });

      // Auto-create block from next vote
      if (nextAction && nextTime) {
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        const tomorrowKey = dateKey(tomorrow);
        const exists = state.blocks.some(b =>
          b.date === tomorrowKey && b.start === nextTime && b.topic === nextAction
        );
        if (!exists) {
          state.blocks.push({
            id: uid(),
            date: tomorrowKey,
            subjectId: null,
            topic: nextAction,
            start: nextTime,
            end: addMinutes(nextTime, 30),
            done: false,
            completedItems: []
          });
        }
      }

      if (Store.save(state)) {
        logAction(I18n.t('atomic.evening_done', null, 'Dia encerrado'));
        const extra = nextAction ? ' + bloco amanhã' : '';
        DS.toast(I18n.t('atomic.evening_done', null, 'Dia encerrado') + extra + ' ✓');
        renderAtomic();
        updateAtomicTabIcon();
      } else {
        DS.toast('Erro ao salvar', 'error');
      }
    });
  }
}

function updateAtomicTabBadge() {
  const tab = document.querySelector('[data-tab="atomic"]');
  if (!tab) return;
  const now = new Date();
  const hour = now.getHours();
  const dk = dateKey(now);
  const record = getCheckinForDate(now);
  const hasEvening = record?.evening;
  const eveningOverdue = hour >= 18 && !hasEvening;
  const badge = tab.querySelector('.atomic-tab-badge');
  if (eveningOverdue) {
    if (!badge) {
      const b = document.createElement('span');
      b.className = 'atomic-tab-badge';
      b.innerHTML = DS.aicon('moon', { size: 10, trigger: 'loop' });
      tab.appendChild(b);
    }
  } else {
    if (badge) badge.remove();
  }
}

function updateAtomicTabIcon() {
  const svg = document.getElementById('atomicTabIcon');
  if (!svg) return;
  const now = new Date();
  const rec = getCheckinForDate(now);
  const hasMorning = rec?.morning;
  const hasEvening = rec?.evening;
  const hour = now.getHours();
  const orbits = `<g class="ai-o1"><ellipse cx="12" cy="12" rx="9" ry="3.4"/><circle cx="21" cy="12" r="1.2" fill="currentColor" stroke="none"/></g><g class="ai-o2"><ellipse cx="12" cy="12" rx="9" ry="3.4"/><circle cx="3" cy="12" r="1.2" fill="currentColor" stroke="none"/></g>`;

  if (hasMorning && hasEvening) {
    svg.innerHTML = `<circle cx="12" cy="12" r="1.6" fill="#34C759" stroke="none"/>${orbits}<polyline points="8 12 11 15 16 9" fill="none" stroke="#34C759" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  } else if (hasMorning && !hasEvening && hour >= 18) {
    svg.innerHTML = `<circle cx="12" cy="12" r="1.6" fill="#FF9500" stroke="none"/>${orbits}<path d="M17 12.79A7 7 0 1 1 11.21 7 5 5 0 0 0 17 12.79z" fill="none" stroke="#FF9500" stroke-width="2"/>`;
  } else if (hasMorning) {
    svg.innerHTML = `<circle cx="12" cy="12" r="1.6" fill="#007AFF" stroke="none"/>${orbits}<path d="M12 2 A10 10 0 0 1 12 22" fill="none" stroke="#007AFF" stroke-width="2"/>`;
  } else {
    svg.innerHTML = `<circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>${orbits}`;
  }
}

function showFieldHelp(title, body) {
  const modal = document.getElementById('modalInfo');
  const titleEl = document.getElementById('modalInfoTitle');
  const bodyEl = document.getElementById('modalInfoBody');
  if (!modal || !titleEl || !bodyEl) return;
  titleEl.textContent = title;
  bodyEl.innerHTML = body;
  DS.sheet.open(modal, 0.6);
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

function hydrateSettingsDOM() {
  const themeSelect = $('#themeSelect');
  const notifToggle = $('#toggleNotif');
  const reminderSelect = $('#reminderTime');
  const marqueeToggle = $('#toggleShowMarquee');

  if (themeSelect) themeSelect.value = state.settings.theme || 'auto';
  if (notifToggle) notifToggle.checked = !!state.settings.notifications;
  if (reminderSelect) reminderSelect.value = state.settings.reminderMin || 10;
  if (marqueeToggle) marqueeToggle.checked = state.settings.showMarquee !== false;

  const zoomSelect = $('#zoomSelect');
  if (zoomSelect) zoomSelect.value = state.settings.zoom || 100;
  applyZoom(state.settings.zoom || 100);

  applyTheme(state.settings.theme || 'auto');
  updateMarqueeVisibility();
}

function applyZoom(level) {
  document.getElementById('app').style.zoom = (level / 100);
}

function initSettings() {
  hydrateSettingsDOM();

  const themeSelect = $('#themeSelect');
  const notifToggle = $('#toggleNotif');
  const reminderSelect = $('#reminderTime');
  const marqueeToggle = $('#toggleShowMarquee');

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
      // Force immediate cloud sync so notification preference survives app restart
      Store.pushToCloud(state);
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
      logAction(I18n.t('log.changed_timezone', { tz: tzSelect.value }, `Fuso horário: ${tzSelect.value}`));
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
      logAction(I18n.t('log.cleared_logs'));
      Store.save(state);
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
        DS.toast(__('auth.logged_out', null, 'Session closed'), 'info');
      }
    });
  }

  const $btnClearData = $('#btnClearData');
  if ($btnClearData) {
    $btnClearData.addEventListener('click', async () => {
      const ok = await DS.confirm(I18n.t('settings.clear_title'), I18n.t('settings.clear_msg'));
      if (ok) {
        // Reset state to defaults and sync empty state to cloud
        state = Store._defaults();
        Store.save(state);
        render();
        if (typeof renderSubjects === 'function') renderSubjects();
        if (typeof initPriorities === 'function') initPriorities();
        DS.toast(I18n.t('log.cleared_data') || 'Dados apagados', 'info');
      }
    });
  }

  // MCP Integration Manager
  const $btnGenMcp = $('#btnGenMcpConfig');
  if ($btnGenMcp) {
    const MCP_CLIENTS = {
      'claude-code':    { name: 'Claude Code',    icon: 'https://cdn.simpleicons.org/claude', wrap: 'mcpServers', path: '~/.claude/settings.json' },
      'claude-desktop': { name: 'Claude Desktop',  icon: 'https://cdn.simpleicons.org/claude', wrap: 'mcpServers', path: '~/Library/Application Support/Claude/claude_desktop_config.json' },
      'cursor':         { name: 'Cursor',          icon: 'https://cdn.simpleicons.org/cursor', wrap: 'mcpServers', path: '.cursor/mcp.json' },
      'vscode':         { name: 'VS Code',         icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M17.58 2.57L10.06 9.37 4.68 5.53 2 6.81v10.38l2.68 1.28 5.38-3.84 7.52 6.8L22 19.67V4.33zm.42 14.6L12.28 12 18 6.83z' fill='%23007ACC'/%3E%3C/svg%3E", wrap: 'servers',    path: '.vscode/mcp.json' },
      'windsurf':       { name: 'Windsurf',        icon: 'https://cdn.simpleicons.org/windsurf', wrap: 'mcpServers', path: '~/.codeium/windsurf/mcp_config.json' },
      'chatgpt':        { name: 'ChatGPT',         icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M22.28 9.37a6.2 6.2 0 00-.54-5.11A6.27 6.27 0 0015 1.26a6.2 6.2 0 00-4.71.05A6.27 6.27 0 005.56 3.4a6.2 6.2 0 00-3.24 3.01 6.27 6.27 0 00.78 7.22 6.2 6.2 0 00.54 5.11A6.27 6.27 0 009 21.74a6.2 6.2 0 004.71-.05 6.27 6.27 0 004.73-2.09 6.2 6.2 0 003.24-3.01 6.27 6.27 0 00-.78-7.22zM13.72 20.6a4.7 4.7 0 01-3.02-.39l.15-.08 5.02-2.9a.82.82 0 00.41-.71v-7.07l2.12 1.22a.08.08 0 01.04.06v5.88a4.73 4.73 0 01-4.72 4z' fill='%2310a37f'/%3E%3Cpath d='M3.52 16.86a4.7 4.7 0 01-.56-3.16l.15.09 5.02 2.9a.82.82 0 00.82 0l6.13-3.54v2.45a.08.08 0 01-.03.07l-5.07 2.93a4.73 4.73 0 01-6.46-1.74z' fill='%2310a37f'/%3E%3Cpath d='M2.27 7.93a4.7 4.7 0 012.46-2.07v5.97a.82.82 0 00.41.71l6.13 3.54-2.12 1.22a.08.08 0 01-.07 0L4.01 14.38a4.73 4.73 0 01-1.74-6.45z' fill='%2310a37f'/%3E%3Cpath d='M17.63 11.46l-6.13-3.54 2.12-1.22a.08.08 0 01.07 0l5.07 2.93a4.73 4.73 0 01-.73 8.52v-5.97a.82.82 0 00-.4-.72z' fill='%2310a37f'/%3E%3Cpath d='M19.75 10.3l-.15-.09-5.02-2.9a.82.82 0 00-.82 0L7.63 10.85V8.4a.08.08 0 01.03-.07l5.07-2.93a4.73 4.73 0 017.02 4.9z' fill='%2310a37f'/%3E%3Cpath d='M7.2 13.15L5.08 11.93a.08.08 0 01-.04-.06V5.99a4.73 4.73 0 017.74-3.62l-.15.08-5.02 2.9a.82.82 0 00-.41.71z' fill='%2310a37f'/%3E%3C/svg%3E", wrap: 'mcpServers', path: 'chatgpt_desktop_config.json' },
      'opencode':       { name: 'OpenCode',        icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2322c55e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M8 9l-3 3 3 3'/%3E%3Cpath d='M16 9l3 3-3 3'/%3E%3Cpath d='M13.5 6l-3 12'/%3E%3C/svg%3E", wrap: 'mcpServers', path: '~/.opencode/config.json' },
      'antigravity':    { name: 'Antigravity',     icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%234285F4' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 2l10 6.5v7L12 22 2 15.5v-7L12 2z'/%3E%3Cpath d='M12 22v-6.5'/%3E%3Cpath d='M22 8.5l-10 7-10-7'/%3E%3Cpath d='M2 15.5l10-7 10 7'/%3E%3C/svg%3E", wrap: 'mcpServers', path: '~/.gemini/antigravity/mcp.json' },
    };

    function buildConfig(clientId, password) {
      const client = MCP_CLIENTS[clientId];
      if (!client) return '';
      const email = Supabase._user?.email || '';
      const obj = {
        [client.wrap]: {
          taketime: {
            command: 'npx',
            args: ['-y', '@taketimemcp/mcp-server@latest'],
            env: {
              TAKETIME_EMAIL: email,
              TAKETIME_PASSWORD: password
            }
          }
        }
      };
      return JSON.stringify(obj, null, 2);
    }

    function getIntegrations() {
      return state.mcpIntegrations || [];
    }

    function renderIntegrations() {
      const list = $('#mcpIntegrationsList');
      if (!list) return;
      const integrations = getIntegrations();

      if (integrations.length === 0) {
        list.innerHTML = '<p style="font-size:13px; color:var(--ds-text-tertiary); text-align:center; padding:16px 0;" data-i18n="mcp.no_integrations">Nenhuma integração criada. Selecione uma IA abaixo.</p>';
        return;
      }

      list.innerHTML = '<p class="ds-label" style="margin-bottom:8px;" data-i18n="mcp.active_integrations">Integrações</p>';
      integrations.forEach((intg, idx) => {
        const client = MCP_CLIENTS[intg.client];
        if (!client) return;
        const isVerified = intg.verified === true;
        const statusColor = isVerified ? '#34c759' : '#ff9500';
        const statusText = isVerified ? __('mcp.status_connected') : __('mcp.status_pending');
        const card = document.createElement('div');
        card.style.cssText = 'background:var(--ds-bg-card); border-radius:var(--ds-radius-md); padding:10px 12px; box-shadow:var(--ds-shadow-sm); margin-bottom:8px; display:flex; align-items:center; justify-content:space-between;';
        card.innerHTML = `
          <div style="display:flex; align-items:center; gap:8px;">
            <div style="position:relative;">
              <img src="${client.icon}" style="height:16px; width:auto;" alt="${client.name}">
              <span style="position:absolute; bottom:-2px; right:-2px; width:7px; height:7px; border-radius:50%; background:${statusColor}; border:1.5px solid var(--ds-bg-card);"></span>
            </div>
            <div>
              <span style="font-size:13px; font-weight:600; color:var(--ds-text-primary);">${client.name}</span>
              <p style="font-size:11px; color:${statusColor}; margin:0;">${statusText}</p>
            </div>
          </div>
          <div style="display:flex; gap:6px;">
            ${!isVerified ? `<button class="ds-btn ds-btn-plain mcp-verify-btn" data-idx="${idx}" style="font-size:11px; padding:4px 8px; color:var(--ds-accent);">${__('mcp.verify')}</button>` : ''}
            <button class="ds-btn ds-btn-plain mcp-remove-btn" data-idx="${idx}" style="font-size:11px; padding:4px 8px; color:var(--ds-danger);">${DS.icon('x', { size: 14 })}</button>
          </div>`;
        list.appendChild(card);
      });

      list.querySelectorAll('.mcp-verify-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
          const idx = parseInt(this.dataset.idx);
          const intg = state.mcpIntegrations[idx];
          if (!intg) return;
          this.textContent = __('mcp.validating');
          this.disabled = true;
          try {
            // Check if MCP server wrote mcp_last_seen recently (within 5 min)
            const remoteState = await Supabase.loadState();
            const lastSeen = remoteState?.mcp_last_seen;
            if (lastSeen) {
              const diff = Date.now() - new Date(lastSeen).getTime();
              if (diff < 5 * 60 * 1000) {
                intg.verified = true;
                delete intg._p;
                Store.save(state);
                DS.toast(__('mcp.verified_ok'), 'success');
                renderIntegrations();
                return;
              }
            }
            DS.toast(__('mcp.verified_fail'), 'error');
            this.textContent = __('mcp.verify');
            this.disabled = false;
          } catch {
            DS.toast(__('mcp.verified_fail'), 'error');
            this.textContent = __('mcp.verify');
            this.disabled = false;
          }
        });
      });

      list.querySelectorAll('.mcp-remove-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
          const idx = parseInt(this.dataset.idx);
          const ok = await DS.confirm(I18n.t('mcp.remove_title'), I18n.t('mcp.remove_msg'), I18n.t('confirm.delete'));
          if (ok) {
            state.mcpIntegrations.splice(idx, 1);
            Store.save(state);
            renderIntegrations();
          }
        });
      });
    }

    // Generate button
    $('#btnMcpGenerate').addEventListener('click', async () => {
      const clientId = $('#mcpClientSelect').value;
      const client = MCP_CLIENTS[clientId];
      const password = $('#mcpPasswordInput').value.trim();

      if (!AuthService.isAuthenticated()) {
        DS.toast(I18n.t('mcp.no_session'), 'warning');
        return;
      }

      if (!password) {
        DS.toast(__('mcp.password_required'), 'warning');
        $('#mcpPasswordInput').focus();
        return;
      }

      // Validate password before generating
      const btn = $('#btnMcpGenerate');
      btn.disabled = true;
      btn.textContent = __('mcp.validating');
      try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: Supabase._user?.email, password })
        });
        if (!res.ok) {
          DS.toast(__('mcp.wrong_password'), 'error');
          btn.disabled = false;
          btn.textContent = I18n.t('mcp.generate');
          return;
        }
      } catch {
        DS.toast(__('mcp.verify_error'), 'error');
        btn.disabled = false;
        btn.textContent = I18n.t('mcp.generate');
        return;
      }

      // Password is valid — generate complete config
      const json = buildConfig(clientId, password);
      $('#mcpGenLabel').innerHTML = `<img src="${client.icon}" style="height:16px; width:auto; vertical-align:middle; margin-right:6px;" alt="${client.name}"> ${client.name}`;
      $('#mcpGenPath').textContent = client.path;
      $('#mcpGenJson').textContent = json;
      $('#mcpGeneratedConfig').classList.remove('hidden');
      $('#mcpPasswordInput').value = '';

      // Save integration
      if (!state.mcpIntegrations) state.mcpIntegrations = [];
      const existIdx = state.mcpIntegrations.findIndex(i => i.client === clientId);
      const intgData = { client: clientId, createdAt: new Date().toISOString(), verified: false, _p: password };
      if (existIdx >= 0) {
        state.mcpIntegrations[existIdx] = intgData;
      } else {
        state.mcpIntegrations.push(intgData);
      }
      Store.save(state);
      renderIntegrations();

      btn.disabled = false;
      btn.textContent = I18n.t('mcp.generate');

      // Auto-copy to clipboard
      navigator.clipboard.writeText(json).then(() => {
        DS.toast(__('mcp.copied_ready'), 'success');
      });
    });

    // Copy config button
    $('#btnMcpCopyConfig').addEventListener('click', function() {
      const text = $('#mcpGenJson').textContent;
      navigator.clipboard.writeText(text).then(() => {
        this.textContent = I18n.t('mcp.copied');
        setTimeout(() => { this.textContent = I18n.t('mcp.copy'); }, 2000);
      });
    });

    // Open modal
    $btnGenMcp.addEventListener('click', () => {
      $('#mcpGeneratedConfig').classList.add('hidden');
      renderIntegrations();
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
      logAction(I18n.t(marqueeToggle.checked ? 'log.marquee_on' : 'log.marquee_off', null, marqueeToggle.checked ? 'Letreiro ativado' : 'Letreiro desativado'));
    });
  }

  const zoomSelect = $('#zoomSelect');
  if (zoomSelect) {
    zoomSelect.addEventListener('change', () => {
      const level = parseInt(zoomSelect.value);
      state.settings.zoom = level;
      applyZoom(level);
      Store.save(state);
      logAction(I18n.t('log.changed_zoom', { level: level + '%' }, `Zoom: ${level}%`));
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
    Store.save(state);
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
  renderFocusBanner();
  renderBlockList();
  renderHeatmap();
}

function renderFocusBanner() {
  const banner = $('#todayFocusBanner');
  if (!banner) return;
  const dk = dateKey(selectedDate);
  const todayStr = dateKey(new Date());
  if (dk !== todayStr) { banner.classList.add('hidden'); return; }
  const rec = getCheckinForDate(new Date());
  const focus = rec?.morning?.focus;
  const identity = rec?.morning?.affirmationText;
  if (!focus && !identity) { banner.classList.add('hidden'); return; }
  banner.className = 'focus-banner';
  banner.innerHTML = `
    <span class="focus-banner-icon">${DS.aicon('target', { size: 16, strokeWidth: 2.5, trigger: 'loop' })}</span>
    <span class="focus-banner-label">
      <strong>${DS.escapeHtml(focus || identity || '')}</strong>
    </span>
  `;
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
  indicator.innerHTML = DS.aicon('repeat', { size: 22, strokeWidth: 2.5, trigger: 'loop' });
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

// ===== MONTHLY VIEW =====
let monthViewDate = new Date();
function openMonthView() {
  monthViewDate = new Date(selectedDate);
  renderMonthView();
  DS.sheet.open($('#modalMonthView'), 0.92);
}

function renderMonthView() {
  const body = $('#monthViewBody');
  const year = monthViewDate.getFullYear();
  const month = monthViewDate.getMonth();
  const title = $('#monthViewTitle');
  title.textContent = new Date(year, month).toLocaleDateString(I18n.locale || 'pt-BR', { month: 'long', year: 'numeric' });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = dateKey(new Date());

  let html = '<div class="month-grid">';
  // Weekday headers
  const dayNames = ['day.sun','day.mon','day.tue','day.wed','day.thu','day.fri','day.sat'];
  html += '<div class="month-grid-header">';
  dayNames.forEach(d => { html += `<span>${I18n.t(d)}</span>`; });
  html += '</div>';

  html += '<div class="month-grid-body">';
  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) html += '<div class="month-cell empty"></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const dk = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayBlocks = state.blocks.filter(b => b.date === dk);
    const activeBlocks = dayBlocks.filter(b => {
      const s = state.subjects.find(s => s.id === b.subjectId);
      return s?.type !== 'inactive';
    });
    const done = activeBlocks.filter(b => b.done).length;
    const total = activeBlocks.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : -1;

    let levelClass = '';
    if (pct >= 100) levelClass = 'level-4';
    else if (pct >= 75) levelClass = 'level-3';
    else if (pct >= 50) levelClass = 'level-2';
    else if (pct >= 0) levelClass = 'level-1';

    const isToday = dk === today;
    const isSelected = dk === dateKey(selectedDate);
    html += `<div class="month-cell ${levelClass} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" data-date="${dk}">
      <span class="month-cell-num">${d}</span>
      ${total > 0 ? `<span class="month-cell-dots">${done}/${total}</span>` : ''}
    </div>`;
  }
  html += '</div></div>';
  body.innerHTML = html;

  // Click to navigate
  body.querySelectorAll('.month-cell[data-date]').forEach(cell => {
    cell.addEventListener('click', () => {
      const [y, m, d] = cell.dataset.date.split('-').map(Number);
      selectedDate = new Date(y, m - 1, d);
      DS.sheet.close($('#modalMonthView'));
      render();
    });
  });
}

// ===== STATS DASHBOARD =====
function openStats() {
  const body = $('#statsBody');
  const blocks = state.blocks || [];
  const subjects = state.subjects || [];

  // Total hours
  let totalMinutes = 0;
  blocks.forEach(b => {
    const [sh, sm] = b.start.split(':').map(Number);
    const [eh, em] = b.end.split(':').map(Number);
    totalMinutes += (eh * 60 + em) - (sh * 60 + sm);
  });
  const totalHours = (totalMinutes / 60).toFixed(1);

  // By subject
  const bySubject = {};
  blocks.forEach(b => {
    const subj = subjects.find(s => s.id === b.subjectId);
    if (!subj || subj.type === 'inactive') return;
    const name = subj.name || 'Unknown';
    if (!bySubject[name]) bySubject[name] = { color: subj.color, minutes: 0, done: 0, total: 0 };
    const [sh, sm] = b.start.split(':').map(Number);
    const [eh, em] = b.end.split(':').map(Number);
    bySubject[name].minutes += (eh * 60 + em) - (sh * 60 + sm);
    bySubject[name].total++;
    if (b.done) bySubject[name].done++;
  });

  // Streak
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dk = dateKey(d);
    const dayActive = blocks.filter(b => {
      if (b.date !== dk) return false;
      const s = subjects.find(s => s.id === b.subjectId);
      return s?.type !== 'inactive';
    });
    if (dayActive.length > 0 && dayActive.every(b => b.done)) {
      streak++;
    } else if (dayActive.length > 0) {
      break;
    }
  }

  // Completed vs pending
  const activeBlocks = blocks.filter(b => {
    const s = subjects.find(s => s.id === b.subjectId);
    return s?.type !== 'inactive';
  });
  const totalDone = activeBlocks.filter(b => b.done).length;
  const totalPending = activeBlocks.length - totalDone;

  let html = `
    <div class="stats-cards">
      <div class="stat-card">
        <span class="stat-value">${totalHours}h</span>
        <span class="stat-label">${I18n.t('stats.total_hours', null, 'Horas totais')}</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">${streak}</span>
        <span class="stat-label">${I18n.t('stats.streak', null, 'Sequência')} (${I18n.t('stats.days', null, 'dias')})</span>
      </div>
      <div class="stat-card">
        <span class="stat-value" style="color:var(--ds-success);">${totalDone}</span>
        <span class="stat-label">${I18n.t('stats.completed', null, 'Concluídos')}</span>
      </div>
      <div class="stat-card">
        <span class="stat-value" style="color:var(--ds-text-tertiary);">${totalPending}</span>
        <span class="stat-label">${I18n.t('stats.pending', null, 'Pendentes')}</span>
      </div>
    </div>
  `;

  // By subject bars
  const sortedSubjects = Object.entries(bySubject).sort((a, b) => b[1].minutes - a[1].minutes);
  if (sortedSubjects.length > 0) {
    const maxMin = sortedSubjects[0][1].minutes;
    html += `<div class="stats-section">
      <h4 class="ds-label" style="margin-bottom:12px;">${I18n.t('stats.by_subject', null, 'Por atividade')}</h4>`;
    sortedSubjects.forEach(([name, data]) => {
      const pct = Math.round((data.minutes / maxMin) * 100);
      const hrs = (data.minutes / 60).toFixed(1);
      html += `
        <div class="stats-bar-row">
          <span class="stats-bar-label">${DS.escapeHtml(name)}</span>
          <div class="stats-bar-track">
            <div class="stats-bar-fill" style="width:${pct}%; background:${data.color};"></div>
          </div>
          <span class="stats-bar-value">${hrs}h</span>
        </div>`;
    });
    html += '</div>';
  }

  body.innerHTML = html;
  DS.sheet.open($('#modalStats'), 0.92);
}

// ===== SHARE SCHEDULE =====
async function shareSchedule() {
  const dayBlocks = state.blocks
    .filter(b => b.date === dateKey(selectedDate))
    .sort((a, b) => a.start.localeCompare(b.start));

  if (dayBlocks.length === 0) {
    DS.toast('Nenhum bloco para compartilhar', 'warning');
    return;
  }

  const dateStr = formatFullDate(selectedDate);
  let text = `📅 ${dateStr}\n\n`;
  dayBlocks.forEach(b => {
    const subj = state.subjects.find(s => s.id === b.subjectId);
    const status = b.done ? '✅' : '⬜';
    text += `${status} ${b.start}-${b.end} ${subj?.name || ''}\n`;
  });

  const active = dayBlocks.filter(b => {
    const s = state.subjects.find(s => s.id === b.subjectId);
    return s?.type !== 'inactive';
  });
  const done = active.filter(b => b.done).length;
  const pct = active.length > 0 ? Math.round((done / active.length) * 100) : 0;
  text += `\n📊 ${done}/${active.length} (${pct}%)`;
  text += '\n\n— Take Time';

  if (navigator.share) {
    try {
      await navigator.share({ title: `Take Time — ${dateStr}`, text });
      return;
    } catch {}
  }

  // Fallback: copy to clipboard
  try {
    await navigator.clipboard.writeText(text);
    DS.toast('Cronograma copiado!', 'success');
  } catch {
    DS.toast('Erro ao copiar', 'error');
  }
}

// ===== DAY TEMPLATES =====
function saveAsTemplate() {
  const dayBlocks = state.blocks.filter(b => b.date === dateKey(selectedDate));
  if (dayBlocks.length === 0) {
    DS.toast(I18n.t('template.empty', null, 'Nenhum bloco para salvar'), 'warning');
    return;
  }

  const name = prompt(I18n.t('template.name', null, 'Nome do template'));
  if (!name) return;

  if (!state.templates) state.templates = [];
  state.templates.push({
    id: uid(),
    name,
    blocks: dayBlocks.map(b => ({
      subjectId: b.subjectId,
      topic: b.topic,
      start: b.start,
      end: b.end,
    })),
  });
  Store.save(state);
  DS.toast(I18n.t('template.saved', null, 'Template salvo'), 'success');
}

async function applyTemplate() {
  if (!state.templates || state.templates.length === 0) {
    DS.toast(I18n.t('template.empty', null, 'Nenhum template salvo'), 'warning');
    return;
  }

  // Build a simple selection UI via DS.sheet
  const templateList = state.templates.map(t =>
    `<div class="ds-list-item template-pick" data-id="${t.id}" style="cursor:pointer; padding:12px;">
      <span style="flex:1;">${DS.escapeHtml(t.name)} (${t.blocks.length} blocos)</span>
      <button class="ds-btn ds-btn-plain template-delete" data-id="${t.id}" style="color:var(--ds-danger);">${DS.icon('x', { size: 16 })}</button>
    </div>`
  ).join('');

  const overlay = document.createElement('div');
  overlay.className = 'ds-overlay';
  overlay.innerHTML = `<div class="ds-sheet" style="max-height:50vh;">
    <div class="ds-sheet-handle-area"><div class="ds-sheet-handle"></div></div>
    <div class="ds-sheet-header">
      <button class="ds-btn ds-btn-plain template-close">${I18n.t('confirm.cancel', null, 'Cancelar')}</button>
      <h3 class="ds-headline">${I18n.t('template.apply', null, 'Aplicar template')}</h3>
      <span></span>
    </div>
    <div class="ds-sheet-body">${templateList}</div>
  </div>`;
  document.body.appendChild(overlay);

  overlay.querySelector('.template-close').addEventListener('click', () => overlay.remove());
  overlay.querySelectorAll('.template-pick').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.template-delete')) return;
      const tpl = state.templates.find(t => t.id === el.dataset.id);
      if (!tpl) return;

      const dk = dateKey(selectedDate);
      tpl.blocks.forEach(tb => {
        const exists = state.blocks.some(b => b.date === dk && b.subjectId === tb.subjectId && b.start === tb.start);
        if (!exists) {
          state.blocks.push({ id: uid(), date: dk, ...tb, done: false, completedItems: [] });
        }
      });
      Store.save(state);
      render();
      overlay.remove();
      DS.toast(I18n.t('template.applied', null, 'Template aplicado'), 'success');
    });
  });
  overlay.querySelectorAll('.template-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await DS.confirm(I18n.t('template.delete', null, 'Excluir template'), '', I18n.t('confirm.delete', null, 'Excluir'));
      if (ok) {
        state.templates = state.templates.filter(t => t.id !== btn.dataset.id);
        Store.save(state);
        overlay.remove();
        applyTemplate(); // reopen with updated list
      }
    });
  });

  requestAnimationFrame(() => DS.sheet.open(overlay, 0.5));
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  // Restore Supabase session from localStorage
  const hasSession = Supabase.loadSession();
  if (hasSession && AuthService.isAuthenticated()) {
    document.documentElement.classList.add('authenticated');
    $('#authScreen').style.display = 'none';
    $('#app').style.display = 'block';
    renderUserProfile();

    // Render IMMEDIATELY with local data (offline-first)
    render();
    renderSubjects();
    renderNotes();
    if (_currentTab === 'atomic') renderAtomic();
    if (typeof initPriorities === 'function') initPriorities();
    if (typeof updateMarqueeVisibility === 'function') updateMarqueeVisibility();

    // Then sync from cloud in background — re-render only if data changed
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
        if (!state.checkins) state.checkins = { affirmations: [], activeAffirmationId: null, records: [] };
        if (!state.notes) state.notes = [];
        state.subjects.forEach(s => { if (!s.type) s.type = 'study'; });
        render();
        renderSubjects();
        renderNotes();
        if (_currentTab === 'atomic') renderAtomic();
        if (typeof initPriorities === 'function') initPriorities();
        if (typeof updateMarqueeVisibility === 'function') updateMarqueeVisibility();
        hydrateSettingsDOM();
      }
    }).catch(() => {});
  }

  await I18n.init();
  I18n.onChange(() => {
    try { render(); } catch(e) { console.error('[i18n] render error:', e); }
    try { renderSubjects(); } catch(e) { console.error('[i18n] renderSubjects error:', e); }
    try { renderPriorities(); } catch(e) { console.error('[i18n] renderPriorities error:', e); }
    I18n.applyStatic();
  });

  initTabs();
  initColorPickers();
  initSettings();
  DS.sheet.init();
  initWeekSwipe();

  // "Hoje" button — go to today
  const $btnToday = $('#btnToday');
  if ($btnToday) $btnToday.addEventListener('click', (e) => {
    e.preventDefault();
    selectedDate = new Date();
    render();
  });

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

  // Notes
  const $btnCreateNote = $('#btnCreateNote');
  if ($btnCreateNote) $btnCreateNote.addEventListener('click', () => openNoteModal());
  const $modalNoteCancel = $('#modalNoteCancel');
  if ($modalNoteCancel) $modalNoteCancel.addEventListener('click', closeNoteModal);
  const $modalNoteSave = $('#modalNoteSave');
  if ($modalNoteSave) $modalNoteSave.addEventListener('click', saveNote);
  const $btnDeleteNote = $('#btnDeleteNote');
  if ($btnDeleteNote) $btnDeleteNote.addEventListener('click', deleteNote);

  // Add new tag button + Enter key
  const $btnAddNoteTag = $('#btnAddNoteTag');
  if ($btnAddNoteTag) $btnAddNoteTag.addEventListener('click', _addNewNoteTag);
  const $inputNoteNewTag = $('#inputNoteNewTag');
  if ($inputNoteNewTag) $inputNoteNewTag.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); _addNewNoteTag(); } });

  // Note editor toolbar
  document.querySelectorAll('#noteToolbar .note-tb-btn').forEach(btn => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault(); // keep focus on editor
      const cmd = btn.dataset.cmd;
      const val = btn.dataset.val || null;
      document.execCommand(cmd, false, val);
    });
  });

  // Views: Weekly, Monthly, Stats
  const $monthViewClose = $('#monthViewClose');
  if ($monthViewClose) $monthViewClose.addEventListener('click', () => DS.sheet.close($('#modalMonthView')));
  const $monthViewPrev = $('#monthViewPrev');
  if ($monthViewPrev) $monthViewPrev.addEventListener('click', () => { monthViewDate.setMonth(monthViewDate.getMonth() - 1); renderMonthView(); });
  const $monthViewNext = $('#monthViewNext');
  if ($monthViewNext) $monthViewNext.addEventListener('click', () => { monthViewDate.setMonth(monthViewDate.getMonth() + 1); renderMonthView(); });
  const $statsClose = $('#statsClose');
  if ($statsClose) $statsClose.addEventListener('click', () => DS.sheet.close($('#modalStats')));

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
        setActiveGroup(segmentBtns, btn);
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
      const materiaInput = $('#inputSyllabusMateria');
      if (!titleInput) return;
      const title = titleInput.value.trim();
      const materia = materiaInput ? materiaInput.value.trim() : '';

      if (!title) { DS.toast(I18n.t('alert.enter_subject', null, 'Digite um assunto'), 'warning'); return; }

      modalContentItems.push({ id: uid(), topic: title, materia: materia || '', status: 'pending' });
      titleInput.value = '';
      // Keep materia for adding multiple assuntos to same materia
      renderModalContentList(modalContentItems, 'study');
      updateMateriaDatalist();
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

  // Enter key for content inputs
  ['inputSyllabusTitle', 'inputSyllabusMateria'].forEach(id => {
    const el = $(`#${id}`);
    if (el) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#btnSyllabusAdd')?.click(); } });
  });
  ['inputExerciseName', 'inputExerciseSets', 'inputExerciseReps', 'inputExerciseWeight'].forEach(id => {
    const el = $(`#${id}`);
    if (el) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#btnExerciseAdd')?.click(); } });
  });
  const $inputRoutine = $('#inputRoutineTask');
  if ($inputRoutine) $inputRoutine.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#btnRoutineTaskAdd')?.click(); } });

      initPriorities();
      render();
      checkNotifications();
      checkAtomicNotifications();
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
        updateAtomicTabBadge();
        checkNotifications();
        checkAtomicNotifications();
      }, 60000);
    
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
          setInterval(() => { reg.update(); }, 30 * 60 * 1000);

          reg.addEventListener('updatefound', () => {
            const newSW = reg.installing;
            if (!newSW) return;
            newSW.addEventListener('statechange', () => {
              if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
                DS.toast('Nova versão disponível! Recarregue para atualizar.', 'info');
              }
            });
          });

          reg.update();
        }).catch(() => {});
      }

      // Pull-to-refresh
      initPullToRefresh();
  });
