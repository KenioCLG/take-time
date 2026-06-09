// ===== DATA LAYER =====
const Store = {
  _key: 'studyplan_v1',
  load() {
    try { return JSON.parse(localStorage.getItem(this._key)) || this._defaults(); }
    catch { return this._defaults(); }
  },
  save(data) {
    try {
      localStorage.setItem(this._key, JSON.stringify(data));
    } catch (e) {
      console.error('Store.save failed:', e);
      alert('Erro ao salvar dados. Verifique o espaço disponível.');
    }
  },
  _defaults() {
    return {
      subjects: [
        // study
        { id: 's1', name: 'JavaScript', color: '#007aff', type: 'study' },
        { id: 's2', name: 'Node.js', color: '#34c759', type: 'study' },
        { id: 's3', name: 'English', color: '#ff9500', type: 'study' },
        // training
        { id: 't1', name: 'Musculação', color: '#ff2d55', type: 'training' },
        { id: 't2', name: 'Cardio', color: '#af52de', type: 'training' },
        // inactive
        { id: 'i1', name: 'Sono', color: '#636366', type: 'inactive' },
        { id: 'i2', name: 'Descanso', color: '#8e8e93', type: 'inactive' },
      ],
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

// ===== UTILS =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ===== STATE =====
let state = Store.load();
// Fixed 24h clock: 0h-24h always
const DAY_START = 0;
const DAY_END = 24;
// Migrate: add logs and type to subjects that don't have one
if (!state.logs) state.logs = [];
state.subjects.forEach(s => { if (!s.type) s.type = 'study'; });

// ====== AUTHENTICATION FLOW ======
$('#btnShowAuthDrawer').addEventListener('click', () => {
  $('#authDrawerOverlay').classList.remove('hidden');
  $('#authBodyLogin').classList.remove('hidden');
  $('#authBodySignup').classList.add('hidden');
  $('#authTitle').textContent = window.I18n ? window.I18n.t('auth.login') || 'Login' : 'Login';
});

$('#authCancel').addEventListener('click', () => {
  $('#authDrawerOverlay').classList.add('hidden');
});

$('#linkGoToSignup').addEventListener('click', (e) => {
  e.preventDefault();
  $('#authBodyLogin').classList.add('hidden');
  $('#authBodySignup').classList.remove('hidden');
  $('#authTitle').textContent = window.I18n ? window.I18n.t('auth.signup') || 'Cadastro' : 'Cadastro';
});

$('#linkGoToLogin').addEventListener('click', (e) => {
  e.preventDefault();
  $('#authBodySignup').classList.add('hidden');
  $('#authBodyLogin').classList.remove('hidden');
  $('#authTitle').textContent = window.I18n ? window.I18n.t('auth.login') || 'Login' : 'Login';
});

function loginUser() {
  $('#authDrawerOverlay').classList.add('hidden');
  $('#authScreen').style.display = 'none';
  $('#app').style.display = 'block';
  // Ensure we render everything smoothly when jumping to app
  if (typeof render === 'function') render();
  if (typeof renderSubjects === 'function') renderSubjects();
}

function handleLoginSubmit() {
  const email = $('#inputAuthEmail').value;
  const pass = $('#inputAuthPassword').value;
  if (!email || !pass) {
    if (window.showToast) window.showToast('Preencha os campos', 'error');
    else alert('Preencha e-mail e senha.');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    if (window.showToast) window.showToast('E-mail inválido', 'error');
    else alert('E-mail inválido.');
    return;
  }
  // Simulate login
  loginUser();
}

$('#btnAuthLogin').addEventListener('click', handleLoginSubmit);
$('#inputAuthPassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleLoginSubmit(); });
$('#inputAuthEmail').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleLoginSubmit(); });

function handleSignupSubmit() {
  const email = $('#inputSignupEmail').value;
  const pass = $('#inputSignupPassword').value;
  const pass2 = $('#inputSignupPasswordRepeat').value;
  if (!email || !pass || !pass2) {
    if (window.showToast) window.showToast('Preencha os campos', 'error');
    else alert('Preencha todos os campos.');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    if (window.showToast) window.showToast('E-mail inválido', 'error');
    else alert('E-mail inválido.');
    return;
  }
  if (pass !== pass2) {
    if (window.showToast) window.showToast('As senhas não coincidem', 'error');
    else alert('As senhas não coincidem.');
    return;
  }
  // Simulate signup
  if (window.showToast) window.showToast('Conta criada com sucesso!', 'success');
  loginUser();
}

$('#btnAuthSignup').addEventListener('click', handleSignupSubmit);
$('#inputSignupEmail').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSignupSubmit(); });
$('#inputSignupPassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSignupSubmit(); });
$('#inputSignupPasswordRepeat').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleSignupSubmit(); });
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
  return e > s ? e - s : (1440 - s) + e; // 1440 = 24*60
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
  if (state.logs.length > 50) state.logs.pop();
  try { Store.save(state); } catch(e) {}
  renderLogs();
}

function renderLogs() {
  const container = $('#logsList');
  if (!container) return;
  
  if (!state.logs || state.logs.length === 0) {
    container.innerHTML = `<div class="ds-list-item" style="color:var(--ds-text-tertiary); justify-content:center; font-size:12px;">${I18n.t('log.empty')}</div>`;
    return;
  }
  
  container.innerHTML = state.logs.map(log => `
    <div class="ds-list-item" style="flex-direction:column; align-items:flex-start; padding:var(--ds-space-2) var(--ds-space-4); gap:2px;">
      <span style="font-size:10px; color:var(--ds-text-tertiary);">${log.timestamp}</span>
      <span style="font-size:13px; color:var(--ds-text-primary); line-height:1.2;">${DS.escapeHtml(log.message)}</span>
    </div>
  `).join('');
}

// ===== SVG PIZZA =====
const SVG_NS = 'http://www.w3.org/2000/svg';
const CX = 200, CY = 200, R_OUTER = 170, R_INNER = 80, R_LABELS = 190;

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

function arcPath(startAngle, endAngle, outerR, innerR) {
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
      label.textContent = `${displayH}h`;
      svg.appendChild(label);
    }
  }

  // Slices
  if (dayBlocks.length === 0) {
    const emptyText = document.createElementNS(SVG_NS, 'text');
    emptyText.setAttribute('x', CX);
    emptyText.setAttribute('y', CY);
    emptyText.setAttribute('class', 'pizza-empty-text');
    emptyText.setAttribute('dominant-baseline', 'central');
    emptyText.textContent = I18n.t('pizza.empty');
    svg.appendChild(emptyText);
  } else {
    const dayStartMin = dayStart * 60;
    const dayEndMin = dayEnd * 60;

    dayBlocks.forEach(block => {
      const subj = state.subjects.find(s => s.id === block.subjectId);
      const color = subj?.color || '#8e8e93';
      const startMin = timeToMinutes(block.start);
      const endMin = timeToMinutes(block.end);
      const isOvernight = endMin <= startMin;

      // Clamp to visible day range — overnight blocks show only the visible portion
      let visStart, visEnd;
      if (isOvernight) {
        // Evening portion: startMin → dayEndMin (or 24:00)
        // Morning portion: dayStartMin → endMin
        // Show whichever falls within the visible range
        if (startMin < dayEndMin) {
          visStart = Math.max(startMin, dayStartMin);
          visEnd = dayEndMin;
        } else if (endMin > dayStartMin) {
          visStart = dayStartMin;
          visEnd = Math.min(endMin, dayEndMin);
        } else {
          return; // entirely outside visible range
        }
      } else {
        visStart = Math.max(startMin, dayStartMin);
        visEnd = Math.min(endMin, dayEndMin);
      }

      if (visEnd <= visStart) return;

      const startAngle = minutesToAngle(visStart);
      const endAngle = minutesToAngle(visEnd);

      const isInactive = subj?.type === 'inactive';
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', arcPath(startAngle, endAngle, R_OUTER - 1, R_INNER + 1));
      path.setAttribute('fill', color);
      if (isInactive) path.setAttribute('opacity', '0.3');
      const sliceClasses = ['pizza-slice'];
      if (block.done) sliceClasses.push('done-slice');
      if (isInactive) sliceClasses.push('inactive-slice');
      path.setAttribute('class', sliceClasses.join(' '));
      path.setAttribute('data-id', block.id);
      path.addEventListener('click', () => openBlockModal(block.id));
      svg.appendChild(path);

      // Slice label (subject name, centered in arc)
      const midAngle = (startAngle + endAngle) / 2;
      const midR = (R_OUTER + R_INNER) / 2;
      const midP = polarToXY(midAngle, midR);
      const arcSpan = endAngle - startAngle;

      if (arcSpan > 12) {
        const sliceLabel = document.createElementNS(SVG_NS, 'text');
        sliceLabel.setAttribute('x', midP.x);
        sliceLabel.setAttribute('y', midP.y);
        sliceLabel.setAttribute('text-anchor', 'middle');
        sliceLabel.setAttribute('dominant-baseline', 'central');
        sliceLabel.setAttribute('fill', isInactive ? 'var(--ds-text-tertiary)' : 'white');
        sliceLabel.setAttribute('font-size', arcSpan > 25 ? '12' : '10');
        sliceLabel.setAttribute('font-weight', '600');
        sliceLabel.setAttribute('font-family', 'var(--ds-font)');
        sliceLabel.setAttribute('pointer-events', 'none');
        sliceLabel.textContent = subj?.name || '';
        svg.appendChild(sliceLabel);
      }
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
      const p1 = polarToXY(nowAngle, R_INNER + 4);
      const p2 = polarToXY(nowAngle, R_OUTER - 2);

      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', p1.x);
      line.setAttribute('y1', p1.y);
      line.setAttribute('x2', p2.x);
      line.setAttribute('y2', p2.y);
      line.setAttribute('class', 'pizza-now-line');
      svg.appendChild(line);

      const dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', p2.x);
      dot.setAttribute('cy', p2.y);
      dot.setAttribute('r', '5');
      dot.setAttribute('class', 'pizza-now-dot');
      svg.appendChild(dot);
    }
  }

  // Stats (exclude inactive from completion tracking)
  const activeBlocks = dayBlocks.filter(b => {
    const s = state.subjects.find(s => s.id === b.subjectId);
    return s?.type !== 'inactive';
  });
  const mins = totalMinutes(activeBlocks);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  $('#statHours').textContent = m > 0 ? I18n.t('duration.hours_minutes', { h, m }) : I18n.t('duration.hours', { h });

  const done = activeBlocks.filter(b => b.done).length;
  const pct = activeBlocks.length > 0 ? Math.round((done / activeBlocks.length) * 100) : 0;
  $('#pizzaCenterLabel').textContent = activeBlocks.length > 0
    ? I18n.t('pizza.completed', { done, total: activeBlocks.length })
    : I18n.t('pizza.planned');

  // Progress bar
  const progressEl = $('#pizzaProgress');
  const fillEl = $('#pizzaProgressFill');
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
              <select class="ds-select select-block-syllabus" data-block-id="${block.id}" style="width:100%; font-size:13px; padding:6px; background:var(--ds-bg-card); color:var(--ds-text-primary); border-radius:var(--ds-radius-xs);">
                <option value="">${I18n.t('syllabus.select_prompt')}</option>
                ${syllabus.map(item => `<option value="${item.id}" ${item.id === selectedId ? 'selected' : ''}>[${item.status === 'completed' ? '\u2713' : '\u25CB'}] ${DS.escapeHtml(item.topic)}</option>`).join('')}
              </select>
            </div>
            ${currentTopic ? `
              <div class="block-details-item">
                <span class="ds-truncate" style="font-size:12px; color:var(--ds-text-secondary);">${DS.escapeHtml(currentTopic.description || I18n.t('syllabus.no_description'))}</span>
                <button class="ds-btn ${currentTopic.status === 'completed' ? 'ds-btn-tinted' : 'ds-btn-filled'} btn-toggle-syllabus-status" data-syllabus-id="${currentTopic.id}" data-block-id="${block.id}" style="font-size:11px; padding:4px 8px; flex-shrink:0;">
                  ${currentTopic.status === 'completed' ? I18n.t('syllabus.pending') : I18n.t('syllabus.complete')}
                </button>
              </div>
            ` : ''}
            <div class="block-details-footer">
              <button class="ds-btn ds-btn-plain btn-edit-block-time" data-block-id="${block.id}" style="font-size:11px; padding:4px 8px;">
                ${DS.icon('edit', { size: 14 })} ${I18n.t('common.edit')}
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
            <div class="block-details-footer">
              <button class="ds-btn ds-btn-plain btn-edit-block-time" data-block-id="${block.id}" style="font-size:11px; padding:4px 8px;">
                ${DS.icon('edit', { size: 14 })} ${I18n.t('common.edit')}
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
            <div class="block-details-footer">
              <button class="ds-btn ds-btn-plain btn-edit-block-time" data-block-id="${block.id}" style="font-size:11px; padding:4px 8px;">
                ${DS.icon('edit', { size: 14 })} ${I18n.t('common.edit')}
              </button>
            </div>
          </div>
        `;
      }
    }

    return `
      <div class="block-item-container">
        <div class="block-card ${block.done ? 'done' : ''} ${isExpanded ? 'expanded' : ''}" style="--block-color:${color}" data-id="${block.id}">
          <div class="block-time-col">
            <div class="block-time-start">${block.start}</div>
            <div class="block-time-end">${block.end}</div>
            ${dur ? `<div class="block-time-duration">${dur}</div>` : ''}
          </div>
          <div class="block-info">
            <div class="block-subject">
              ${DS.escapeHtml(subj?.name) || I18n.t('block.no_subject')}
              <span class="block-chevron">${DS.icon(isExpanded ? 'chevronD' : 'chevronR', { size: 14 })}</span>
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
        const subj = state.subjects.find(s => s.id === block.subjectId);
        logAction(I18n.t(block.done ? 'log.block_done' : 'log.block_undone', { name: subj?.name || block.topic }));
        try { Store.save(state); } catch(e) {};
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
        try { Store.save(state); } catch(err) {}
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
        try { Store.save(state); } catch(err) {}
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
        try { Store.save(state); } catch(err) {}
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
        logAction(I18n.t(topic.status === 'completed' ? 'log.syllabus_done' : 'log.syllabus_undone', { name: topic.title }));
        try { Store.save(state); } catch(err) {}
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
}

// ===== RENDER: WEEK NAV =====
function renderWeekNav() {
  const nav = $('#weekNav');
  nav.innerHTML = '';
  const today = new Date();
  const startOfWeek = new Date(selectedDate);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

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
    nav.appendChild(btn);
  }
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
    list.innerHTML = `<p style="text-align:center;color:var(--ds-text-tertiary);padding:40px">${I18n.t('subject.empty')}</p>`;
    return;
  }

  list.innerHTML = sections.map(({ type, cfg, items }) => `
    <div class="subject-section">
      <div class="subject-section-header">
        <span class="subject-section-icon">${DS.icon(cfg.icon, { size: 18 })}</span>
        <span class="subject-section-title">${DS.escapeHtml(I18n.t(cfg.i18nKey))}</span>
        <span class="subject-section-count">${items.length}</span>
        <button class="ds-btn ds-btn-icon-sm subject-section-add" data-type="${type}" aria-label="${I18n.t(cfg.i18nKey)}">
          ${DS.icon('plus', { size: 16, strokeWidth: 2.5 })}
        </button>
      </div>
      ${items.length === 0 ? `<p class="subject-empty">${I18n.t('subject.none')}</p>` : items.map(s => {
        const count = state.blocks.filter(b => b.subjectId === s.id).length;
        return `
          <div class="subject-card" data-subject-id="${s.id}" data-type="${s.type}" style="cursor:pointer;">
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
        try { Store.save(state); } catch(e) {};
        render();
        renderSubjects();
      }
    });
  });
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

  $('#modalBlock').classList.remove('hidden');
}

function closeBlockModal() { $('#modalBlock').classList.add('hidden'); editingBlockId = null; }

let subjectModalType = 'study';
let currentEditingSubjectId = null;
let modalSlots = [];
let modalContentItems = [];

function renderModalSlots(slots = []) {
  modalSlots = [...slots];
  const listEl = $('#profileSlotsList');
  const days = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

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
      btn.addEventListener('click', () => {
        modalSlots.splice(parseInt(btn.dataset.index), 1);
        render();
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
      listEl.innerHTML = `<p style="text-align:center; color:var(--ds-text-tertiary); font-size:12px; padding:10px;">${I18n.t('content.none')}</p>`;
      return;
    }
    
    listEl.innerHTML = modalContentItems.map((item, index) => {
      let desc = '';
      if (type === 'study') {
        desc = `<span>${DS.escapeHtml(item.topic)}</span> <span style="font-size:11px; color:var(--ds-text-secondary); margin-left:6px;">${item.duration ? item.duration + ' min' : ''}</span>`;
      } else if (type === 'training') {
        desc = `<div><strong>${DS.escapeHtml(item.name)}</strong> <span style="font-size:11px; color:var(--ds-text-secondary); margin-left:6px;">${item.sets}x${item.reps} (${item.weight})</span></div>`;
      } else {
        desc = `<span>${DS.escapeHtml(item.task)}</span>`;
      }
      
      return `
        <div class="ds-list-item" style="padding:var(--ds-space-2) var(--ds-space-3); border-radius:var(--ds-radius-xs); background:var(--ds-bg-secondary); display:flex; justify-content:space-between; align-items:center; width:100%;">
          <div style="flex:1; min-width:0; font-size:13px;">${desc}</div>
          <button type="button" class="ds-btn ds-btn-plain btn-remove-content" data-index="${index}" style="color:var(--ds-danger); padding:4px;">
            ${DS.icon('x', { size: 16 })}
          </button>
        </div>
      `;
    }).join('');
    
    listEl.querySelectorAll('.btn-remove-content').forEach(btn => {
      btn.addEventListener('click', () => {
        modalContentItems.splice(parseInt(btn.dataset.index), 1);
        render();
      });
    });
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
  $('#modalSubject').classList.remove('hidden');
}

function closeSubjectModal() { $('#modalSubject').classList.add('hidden'); currentEditingSubjectId = null; }

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

  if (!subjectId) return alert(I18n.t('alert.select_subject'));
  if (!start || !end) return alert(I18n.t('alert.set_time'));
  if (start === end) return alert(I18n.t('alert.end_after_start'));

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

  try { Store.save(state); } catch(e) {};
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
      alert(I18n.t('alert.invalid_time', { start: s1.start, end: s1.end }));
      return true;
    }
    if (days1.length === 0) {
      alert(I18n.t('alert.select_day', { start: s1.start, end: s1.end }));
      return true;
    }

    for (let j = i + 1; j < slots.length; j++) {
      const s2 = slots[j];
      const days2 = s2.daysOfWeek || (s2.dayOfWeek !== undefined ? [s2.dayOfWeek] : []);
      const overlapDays = days1.filter(d => days2.includes(d));
      if (overlapDays.length > 0 && rangesOverlap(s1.start, s1.end, s2.start, s2.end)) {
        alert(I18n.t('alert.conflict_internal'));
        return true;
      }
    }

    for (const other of state.subjects) {
      if (other.id === subjectId) continue;
      for (const oSlot of (other.slots || [])) {
        const oDays = oSlot.daysOfWeek || (oSlot.dayOfWeek !== undefined ? [oSlot.dayOfWeek] : []);
        const overlapDays = days1.filter(d => oDays.includes(d));
        if (overlapDays.length > 0 && rangesOverlap(s1.start, s1.end, oSlot.start, oSlot.end)) {
          alert(I18n.t('alert.conflict_subject', { name: other.name }));
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
  if (!name) return alert(I18n.t('alert.enter_name'));
  if (name.length > 40) return alert(I18n.t('alert.name_too_long'));

  const duplicate = state.subjects.find(s => s.name.toLowerCase() === name.toLowerCase() && s.id !== currentEditingSubjectId);
  if (duplicate) return alert(I18n.t('alert.duplicate_name'));
  
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
  
  try { Store.save(state); } catch(e) {};
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

  $$('.ds-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.ds-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const p = pages[tab.dataset.tab];
      p.show.forEach(s => { const el = $(s); if (el) el.classList.remove('hidden'); });
      p.hide.forEach(s => { const el = $(s); if (el) el.classList.add('hidden'); });

      if (tab.dataset.tab === 'subjects') renderSubjects();
    });
  });
}

// ===== SETTINGS =====
function updateClock() {
  const tz = state.settings.timezone || 'America/Sao_Paulo';
  const now = new Date();
  $('#headerClock').textContent = now.toLocaleTimeString(I18n.locale, { hour: '2-digit', minute: '2-digit', timeZone: tz });
}

function initSettings() {
  const themeSelect = $('#themeSelect');
  const notifToggle = $('#toggleNotif');
  const reminderSelect = $('#reminderTime');

  themeSelect.value = state.settings.theme;
  notifToggle.checked = state.settings.notifications;
  reminderSelect.value = state.settings.reminderMin;

  applyTheme(state.settings.theme);

  themeSelect.addEventListener('change', () => {
    state.settings.theme = themeSelect.value;
    applyTheme(themeSelect.value);
    Store.save(state);
    logAction(I18n.t('log.changed_theme', { theme: themeSelect.value }));
  });

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

  reminderSelect.addEventListener('change', () => {
    state.settings.reminderMin = parseInt(reminderSelect.value);
    Store.save(state);
    logAction(I18n.t('log.changed_reminder', { min: reminderSelect.value }));
  });

  const tzSelect = $('#timezoneSelect');
  tzSelect.value = state.settings.timezone || 'America/Sao_Paulo';
  tzSelect.addEventListener('change', () => {
    state.settings.timezone = tzSelect.value;
    Store.save(state);
    updateClock();
  });

  const langSelect = $('#langSelect');
  langSelect.value = I18n.locale;
  langSelect.addEventListener('change', async () => {
    await I18n.setLocale(langSelect.value);
    logAction(I18n.t('log.changed_lang', { lang: langSelect.value }));
  });

  $('#btnTestNotif').addEventListener('click', async () => {
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
        await reg.showNotification(I18n.t('notification.title'), {
          body: I18n.t('settings.test_notif_body'),
          icon: 'icons/icon-192.png',
          vibrate: [200, 100, 200, 100, 200],
          tag: 'test-notif',
        });
      } else if ('Notification' in window) {
        new Notification(I18n.t('notification.title'), { body: I18n.t('settings.test_notif_body') });
      }
      logAction(I18n.t('log.test_notification'));
      DS.toast(I18n.t('settings.test_notif'), 'success');
    } catch (err) {
      console.error('Test notification error:', err);
    }
  });

  $('#btnClearLogs').addEventListener('click', () => {
    state.logs = [];
    Store.save(state);
    renderLogs();
    logAction(I18n.t('log.cleared_logs'));
  });

  $('#btnClearData').addEventListener('click', async () => {
    const ok = await DS.confirm(I18n.t('settings.clear_title'), I18n.t('settings.clear_msg'));
    if (ok) {
      localStorage.removeItem(Store._key);
      state = Store.load();
      render();
      logAction(I18n.t('log.cleared_data'));
    }
  });
}

function applyTheme(theme) {
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}

// ===== DAILY BLOCKS GENERATOR FROM WEEKLY SLOTS =====
function initDailyBlocksFromProfiles(date) {
  const dKey = dateKey(date);
  const dayOfWeek = date.getDay(); // 0 is Sunday, 1 is Monday...

  const existing = state.blocks.some(b => b.date === dKey);
  if (existing) return;

  const newBlocks = [];
  state.subjects.forEach(profile => {
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
    try { Store.save(state); } catch(e) {}
  }
}

// ===== MAIN RENDER =====
function render() {
  initDailyBlocksFromProfiles(selectedDate);
  $('#headerDate').textContent = formatFullDate(selectedDate);
  renderWeekNav();
  renderPizza();
  renderBlockList();
}

// ===== NOTIFICATION SCHEDULER =====
const notifiedBlocks = new Set();
function checkNotifications() {
  if (!state.settings.notifications) return;

  const now = new Date();
  const todayKey = dateKey(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  if (checkNotifications.lastDate && checkNotifications.lastDate !== todayKey) {
    notifiedBlocks.clear();
  }
  checkNotifications.lastDate = todayKey;

  const todayBlocks = state.blocks.filter(b => b.date === todayKey);
  const reminderMin = state.settings.reminderMin || 10;

  todayBlocks.forEach(block => {
    if (notifiedBlocks.has(block.id)) return;

    const startMin = timeToMinutes(block.start);
    const diff = startMin - nowMin;

    if (diff > 0 && diff <= reminderMin) {
      const subj = state.subjects.find(s => s.id === block.subjectId);
      const subjName = subj ? subj.name : I18n.t('block.subject');
      const msg = I18n.t('notification.block_starting', { name: subjName, start: block.start, end: block.end, diff });

      // In-App Toast
      DS.toast(msg, 'info');

      // Native Notification via Service Worker (works in background on mobile)
      if ('Notification' in window && Notification.permission === 'granted') {
        const notifOptions = {
          body: msg,
          icon: 'icons/icon-192.png',
          badge: 'icons/icon-192.png',
          tag: block.id,
          renotify: true,
          vibrate: [200, 100, 200, 100, 200],
          requireInteraction: true,
          data: { url: '/', blockId: block.id }
        };

        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then(reg => {
            reg.showNotification(I18n.t('notification.title'), notifOptions);
          }).catch(() => {
            try { new Notification(I18n.t('notification.title'), notifOptions); } catch(e) {}
          });
        } else {
          try { new Notification(I18n.t('notification.title'), notifOptions); } catch(e) {}
        }
      }

      notifiedBlocks.add(block.id);
    }
  });
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  await I18n.init();
  I18n.onChange(() => { render(); renderSubjects(); });

  initTabs();
  initColorPickers();
  initSettings();

  $('#modalCancel').addEventListener('click', closeBlockModal);
  $('#modalSave').addEventListener('click', saveBlock);
  $('#btnDeleteBlock').addEventListener('click', deleteBlock);
  $('#modalSubjectCancel').addEventListener('click', closeSubjectModal);
  $('#modalSubjectSave').addEventListener('click', saveSubject);

  // Profile Slots and Content button bindings
  $('#btnProfileAddSlot').addEventListener('click', () => {
    modalSlots.push({ daysOfWeek: [1, 3, 5], start: '08:00', end: '10:00' });
    renderModalSlots(modalSlots);
  });

  $('#btnCreateSubject').addEventListener('click', () => {
    openSubjectModal('study');
  });

  $('#inputSubjectType').addEventListener('change', (e) => {
    const newType = e.target.value;
    subjectModalType = newType;
    $('#formAddSyllabus').classList.toggle('hidden', newType !== 'study');
    $('#formAddExercise').classList.toggle('hidden', newType !== 'training');
    $('#formAddRoutineTask').classList.toggle('hidden', newType !== 'inactive');
    modalContentItems = [];
    renderModalContentList(modalContentItems, newType);
  });

  $('#btnSyllabusAdd').addEventListener('click', () => {
    const titleInput = $('#inputSyllabusTitle');
    const durInput = $('#inputSyllabusDuration');
    const title = titleInput.value.trim();
    const duration = parseInt(durInput.value) || 0;
    if (!title) return alert(I18n.t('alert.enter_topic'));
    modalContentItems.push({ id: uid(), topic: title, duration, description: '', status: 'pending' });
    titleInput.value = '';
    durInput.value = '';
    renderModalContentList(modalContentItems, 'study');
  });


      
      // Add Subject Bindings
      $('#btnAddSubject').addEventListener('click', () => {
        $('#configModal').classList.add('hidden');
        $('#addSubjectModal').classList.remove('hidden');
      });
      
      $('#btnCancelAddSubject').addEventListener('click', () => {
        $('#addSubjectModal').classList.add('hidden');
        $('#configModal').classList.remove('hidden');
      });
      
      $('#formAddSubject').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = $('#inputNewSubjectName').value.trim();
        const color = $('#inputNewSubjectColor').value;
        const type = $('#inputTypeSelect').value;
        if (name) {
          const newSub = { id: uid(), name, color, type, syllabus: [] };
          if (type === 'training') newSub.exercises = [];
          if (type === 'inactive') newSub.checklist = [];
          
          state.subjects.push(newSub);
          logAction(I18n.t('log.subject_add', { name }));
          Store.save(state);
          $('#inputNewSubjectName').value = '';
          $('#addSubjectModal').classList.add('hidden');
          $('#configModal').classList.remove('hidden');
          populateSubjectSelect();
        }
      });
    
      $('#inputTypeSelect').addEventListener('change', (e) => {
        document.querySelectorAll('.add-content-form').forEach(el => el.classList.add('hidden'));
        const t = e.target.value;
        if (t === 'study') $('#formAddSyllabus').classList.remove('hidden');
        if (t === 'training') $('#formAddExercise').classList.remove('hidden');
        if (t === 'inactive') $('#formAddChecklist').classList.remove('hidden');
        populateSubjectSelect(t);
      });
    
      // Add Syllabus Content
      $('#btnSyllabusAdd').addEventListener('click', () => {
        const subId = $('#inputSubject').value;
        const title = $('#inputSyllabusTitle').value.trim();
        const link = $('#inputSyllabusLink').value.trim();
        const dur = parseInt($('#inputSyllabusDuration').value, 10) || 60;
        if (!subId || !title) return alert('Selecione matéria e título');
        const subj = state.subjects.find(s => s.id === subId);
        if (!subj.syllabus) subj.syllabus = [];
        subj.syllabus.push({ id: uid(), title, link, expectedDurationMin: dur });
        Store.save(state);
        $('#inputSyllabusTitle').value = '';
        $('#inputSyllabusLink').value = '';
        alert('Tópico adicionado!');
      });
    
      // Add Exercise Content
      $('#btnExerciseAdd').addEventListener('click', () => {
        const subId = $('#inputSubject').value;
        const name = $('#inputExerciseName').value.trim();
        const sets = parseInt($('#inputExerciseSets').value, 10) || 3;
        const reps = $('#inputExerciseReps').value.trim() || '12';
        const weight = $('#inputExerciseWeight').value.trim() || '-';
        if (!subId || !name) return alert('Selecione o treino e digite o exercício');
        const subj = state.subjects.find(s => s.id === subId);
        if (!subj.exercises) subj.exercises = [];
        subj.exercises.push({ id: uid(), name, sets, reps, weight });
        Store.save(state);
        $('#inputExerciseName').value = '';
        alert('Exercício adicionado!');
      });
    
      // Add Checklist Content
      $('#btnChecklistAdd').addEventListener('click', () => {
        const subId = $('#inputSubject').value;
        const task = $('#inputChecklistTask').value.trim();
        if (!subId || !task) return alert('Selecione a rotina e digite a tarefa');
        const subj = state.subjects.find(s => s.id === subId);
        if (!subj.checklist) subj.checklist = [];
        subj.checklist.push({ id: uid(), task });
        Store.save(state);
        $('#inputChecklistTask').value = '';
        alert('Tarefa adicionada!');
      });
    
      render();
      checkNotifications();
    
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
    
      if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  });
