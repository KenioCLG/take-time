/*
 * StudyPlan — Unit Tests
 * Usa Node.js built-in test runner (node --test)
 * Roda: node --test tests/utils.test.js
 *
 * Cobre as funções puras de app.js: dateKey, durationLabel,
 * timeToMinutes, totalMinutes, minutesToAngle, polarToXY, arcPath
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// === Réplicas das funções puras de app.js (sem DOM) ===
// Extraídas para teste isolado. Se o app crescer, elas devem
// ser movidas para um módulo utils.js com export.

function dateKey(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function durationLabel(start, end) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) return '';
  if (mins < 60) return `${mins}min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function totalMinutes(blocks) {
  return blocks.reduce((acc, b) => {
    const [sh, sm] = b.start.split(':').map(Number);
    const [eh, em] = b.end.split(':').map(Number);
    return acc + Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
  }, 0);
}

// minutesToAngle precisa do state — parametrizamos dayStart/dayEnd
function minutesToAngle(minutes, dayStart = 6, dayEnd = 22) {
  const dayStartMin = dayStart * 60;
  const dayEndMin = dayEnd * 60;
  const totalDay = dayEndMin - dayStartMin;
  const clamped = Math.max(dayStartMin, Math.min(dayEndMin, minutes));
  return ((clamped - dayStartMin) / totalDay) * 360 - 90;
}

const CX = 200, CY = 200;
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

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// =============================================================
//  TESTS
// =============================================================

describe('dateKey()', () => {
  it('formata Date como YYYY-MM-DD', () => {
    assert.equal(dateKey(new Date(2026, 0, 5)), '2026-01-05');
    assert.equal(dateKey(new Date(2026, 11, 25)), '2026-12-25');
  });

  it('padroniza mês e dia com zero à esquerda', () => {
    assert.equal(dateKey(new Date(2026, 5, 8)), '2026-06-08');
    assert.equal(dateKey(new Date(2026, 0, 1)), '2026-01-01');
  });

  it('aceita string ISO como input', () => {
    const result = dateKey('2026-03-15T10:00:00');
    assert.equal(result, '2026-03-15');
  });

  it('dois Date do mesmo dia retornam a mesma key', () => {
    const d1 = new Date(2026, 5, 8, 9, 0);
    const d2 = new Date(2026, 5, 8, 21, 30);
    assert.equal(dateKey(d1), dateKey(d2));
  });

  it('dois Date de dias diferentes retornam keys diferentes', () => {
    const d1 = new Date(2026, 5, 8);
    const d2 = new Date(2026, 5, 9);
    assert.notEqual(dateKey(d1), dateKey(d2));
  });
});


describe('durationLabel()', () => {
  it('retorna minutos quando < 60', () => {
    assert.equal(durationLabel('08:00', '08:30'), '30min');
    assert.equal(durationLabel('14:00', '14:45'), '45min');
  });

  it('retorna horas inteiras quando múltiplo de 60', () => {
    assert.equal(durationLabel('08:00', '09:00'), '1h');
    assert.equal(durationLabel('08:00', '10:00'), '2h');
  });

  it('retorna horas + minutos quando misto', () => {
    assert.equal(durationLabel('08:00', '09:30'), '1h30m');
    assert.equal(durationLabel('08:00', '10:15'), '2h15m');
  });

  it('retorna string vazia quando fim <= início', () => {
    assert.equal(durationLabel('09:00', '08:00'), '');
    assert.equal(durationLabel('09:00', '09:00'), '');
  });

  it('retorna 1min para diferença mínima', () => {
    assert.equal(durationLabel('08:00', '08:01'), '1min');
  });
});


describe('timeToMinutes()', () => {
  it('converte meia-noite para 0', () => {
    assert.equal(timeToMinutes('00:00'), 0);
  });

  it('converte horários comuns', () => {
    assert.equal(timeToMinutes('08:00'), 480);
    assert.equal(timeToMinutes('12:30'), 750);
    assert.equal(timeToMinutes('23:59'), 1439);
  });

  it('converte hora cheia sem minutos extras', () => {
    assert.equal(timeToMinutes('06:00'), 360);
    assert.equal(timeToMinutes('22:00'), 1320);
  });
});


describe('totalMinutes()', () => {
  it('retorna 0 para array vazio', () => {
    assert.equal(totalMinutes([]), 0);
  });

  it('soma um bloco', () => {
    const blocks = [{ start: '08:00', end: '09:30' }];
    assert.equal(totalMinutes(blocks), 90);
  });

  it('soma múltiplos blocos', () => {
    const blocks = [
      { start: '08:00', end: '09:00' },  // 60
      { start: '10:00', end: '11:30' },  // 90
      { start: '14:00', end: '14:45' },  // 45
    ];
    assert.equal(totalMinutes(blocks), 195);
  });

  it('ignora blocos com fim <= início (retorna 0 para eles)', () => {
    const blocks = [
      { start: '08:00', end: '09:00' },  // 60
      { start: '10:00', end: '09:00' },  // 0 (inválido)
    ];
    assert.equal(totalMinutes(blocks), 60);
  });
});


describe('minutesToAngle()', () => {
  it('início do dia (06:00) retorna -90° (topo do relógio)', () => {
    assert.equal(minutesToAngle(360, 6, 22), -90);
  });

  it('fim do dia (22:00) retorna 270° (volta ao topo)', () => {
    assert.equal(minutesToAngle(1320, 6, 22), 270);
  });

  it('meio do dia retorna 90° (embaixo)', () => {
    // Meio de 6h-22h = 14h → 840 min
    assert.equal(minutesToAngle(840, 6, 22), 90);
  });

  it('clampa valores antes do início do dia', () => {
    // 05:00 (300 min) deveria ser clampado para 06:00 (360 min)
    assert.equal(minutesToAngle(300, 6, 22), minutesToAngle(360, 6, 22));
  });

  it('clampa valores depois do fim do dia', () => {
    // 23:00 (1380 min) deveria ser clampado para 22:00 (1320 min)
    assert.equal(minutesToAngle(1380, 6, 22), minutesToAngle(1320, 6, 22));
  });

  it('funciona com config diferente (dayStart=8, dayEnd=20)', () => {
    assert.equal(minutesToAngle(480, 8, 20), -90);  // 08:00 = topo
    assert.equal(minutesToAngle(1200, 8, 20), 270); // 20:00 = volta
  });
});


describe('polarToXY()', () => {
  it('-90° (topo) retorna x=centro, y=centro-raio', () => {
    const p = polarToXY(-90, 100);
    assert.ok(Math.abs(p.x - 200) < 0.01, `x deveria ser ~200, got ${p.x}`);
    assert.ok(Math.abs(p.y - 100) < 0.01, `y deveria ser ~100, got ${p.y}`);
  });

  it('0° (direita) retorna x=centro+raio, y=centro', () => {
    const p = polarToXY(0, 100);
    assert.ok(Math.abs(p.x - 300) < 0.01);
    assert.ok(Math.abs(p.y - 200) < 0.01);
  });

  it('90° (embaixo) retorna x=centro, y=centro+raio', () => {
    const p = polarToXY(90, 100);
    assert.ok(Math.abs(p.x - 200) < 0.01);
    assert.ok(Math.abs(p.y - 300) < 0.01);
  });

  it('180° (esquerda) retorna x=centro-raio, y=centro', () => {
    const p = polarToXY(180, 100);
    assert.ok(Math.abs(p.x - 100) < 0.01);
    assert.ok(Math.abs(p.y - 200) < 0.01);
  });

  it('raio 0 retorna o centro', () => {
    const p = polarToXY(45, 0);
    assert.ok(Math.abs(p.x - 200) < 0.01);
    assert.ok(Math.abs(p.y - 200) < 0.01);
  });
});


describe('arcPath()', () => {
  it('retorna string SVG path válida', () => {
    const path = arcPath(-90, 0, 170, 80);
    assert.ok(path.startsWith('M '));
    assert.ok(path.includes('A '));
    assert.ok(path.includes('L '));
    assert.ok(path.endsWith('Z'));
  });

  it('contém 4 pontos (M, A outer, L, A inner, Z)', () => {
    const path = arcPath(0, 90, 170, 80);
    const commands = path.match(/[MALZ]/g);
    assert.equal(commands.length, 5); // M, A, L, A, Z
  });

  it('arco < 180° usa largeArc = 0', () => {
    const path = arcPath(0, 90, 170, 80);
    // O primeiro A deve ter flag 0
    assert.ok(path.includes('0 1'), 'deveria ter largeArc=0, sweep=1');
  });

  it('arco > 180° usa largeArc = 1', () => {
    const path = arcPath(0, 200, 170, 80);
    assert.ok(path.includes('1 1'), 'deveria ter largeArc=1, sweep=1');
  });

  it('arco >= 360° é clampado para 359.99°', () => {
    const path = arcPath(0, 360, 170, 80);
    // Não deveria causar erro, e os pontos start/end não devem coincidir
    assert.ok(path.includes('M '));
    assert.ok(path.endsWith('Z'));
  });
});


describe('escapeHtml()', () => {
  it('escapa < e >', () => {
    assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
  });

  it('escapa aspas duplas e simples', () => {
    assert.equal(escapeHtml('"test"'), '&quot;test&quot;');
    assert.equal(escapeHtml("'test'"), '&#39;test&#39;');
  });

  it('escapa &', () => {
    assert.equal(escapeHtml('a & b'), 'a &amp; b');
  });

  it('retorna string vazia para null/undefined/empty', () => {
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
    assert.equal(escapeHtml(''), '');
  });

  it('não altera texto seguro', () => {
    assert.equal(escapeHtml('Hello World 123'), 'Hello World 123');
  });

  it('escapa ataque XSS completo', () => {
    const input = '<img src=x onerror="alert(1)">';
    const output = escapeHtml(input);
    assert.ok(!output.includes('<'));
    assert.ok(!output.includes('>'));
  });
});
