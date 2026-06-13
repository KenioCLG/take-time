#!/usr/bin/env node

import { SupabaseClient, clearSession } from './supabase.js';
import {
  c, bold, dim, banner, header, success, error, warn, info,
  table, progressBar, heatBlock, prompt, promptPassword, confirm,
} from './ui.js';

const db = new SupabaseClient();
const args = process.argv.slice(2);
const cmd = args[0]?.toLowerCase();
const sub = args[1]?.toLowerCase();

// Parse flags from args: --key=value or --flag
function parseFlags(fromIndex = 2) {
  const flags = {};
  for (let i = fromIndex; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq > 0) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else {
        flags[arg.slice(2)] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
      }
    }
  }
  return flags;
}

const flags = parseFlags(cmd === 'help' || !cmd ? 0 : sub ? 2 : 1);
const today = () => new Date().toISOString().split('T')[0];

// ==================== AUTH ====================

async function ensureAuth() {
  const ok = await db.restoreSession();
  if (!ok) {
    error('Not logged in. Run: taketime login');
    process.exit(1);
  }
}

async function cmdLogin() {
  header('Login to Take Time');
  const email = flags.email || await prompt('Email: ');
  const password = flags.password || await promptPassword('Password: ');

  try {
    const user = await db.loginWithCredentials(email, password);
    success(`Logged in as ${c.cyan(user.email)}`);
    info(`User ID: ${dim(user.id)}`);
  } catch (e) {
    error(`Login failed: ${e.message}`);
    process.exit(1);
  }
}

function cmdLogout() {
  clearSession();
  success('Logged out. Session cleared.');
}

async function cmdStatus() {
  header('Connection Status');
  const ok = await db.restoreSession();
  if (ok) {
    success(`Authenticated as ${c.cyan(db.userEmail)}`);
    info(`User ID: ${dim(db.userId)}`);

    const [subjects, blocks, priorities] = await Promise.all([
      db.query('subjects'),
      db.query('blocks', { date: today() }),
      db.query('priorities'),
    ]);

    const doneToday = (blocks || []).filter(b => b.done).length;
    const totalToday = (blocks || []).length;

    console.log('');
    info(`Activities: ${(subjects || []).length}`);
    info(`Today's blocks: ${doneToday}/${totalToday} completed`);
    info(`Priority items: ${(priorities || []).length}`);
  } else {
    warn('Not logged in');
    info('Run: taketime login');
  }
}

// ==================== SUBJECTS ====================

async function cmdSubjects() {
  await ensureAuth();

  if (sub === 'create' || sub === 'add') return cmdSubjectCreate();
  if (sub === 'update' || sub === 'edit') return cmdSubjectUpdate();
  if (sub === 'delete' || sub === 'rm') return cmdSubjectDelete();
  if (sub === 'items') return cmdSubjectItems();
  if (sub === 'show' || sub === 'info') return cmdSubjectShow();

  header('Activities');

  const subjects = await db.query('subjects', {}, '&order=sort_order') || [];
  if (subjects.length === 0) {
    info('No activities yet. Create one: taketime subjects create');
    return;
  }

  const allItems = await db.query('subject_items') || [];
  const typeIcons = { study: '📚', training: '💪', inactive: '🌙' };
  const typeLabels = { study: 'Study', training: 'Training', inactive: 'Routine' };

  const rows = subjects.map(s => {
    const items = allItems.filter(i => i.subject_id === s.id);
    const doneCount = items.filter(i => i.done).length;
    const icon = typeIcons[s.type] || '📋';
    const progress = items.length > 0 ? progressBar(doneCount, items.length, 12) : dim('—');

    return [
      `${icon} ${bold(s.name)}`,
      typeLabels[s.type] || s.type,
      s.color,
      `${items.length} items`,
      progress,
      dim(s.id.slice(0, 8)),
    ];
  });

  table(['Name', 'Type', 'Color', 'Items', 'Progress', 'ID'], rows);
}

async function cmdSubjectCreate() {
  const name = flags.name || await prompt('Activity name: ');
  if (!name) { error('Name is required.'); return; }

  const typeChoices = ['study', 'training', 'inactive'];
  let type = flags.type;
  if (!type) {
    info('Types: study (📚), training (💪), inactive (🌙 routine)');
    type = await prompt('Type [study/training/inactive]: ');
  }
  if (!typeChoices.includes(type)) { error(`Invalid type. Use: ${typeChoices.join(', ')}`); return; }

  const colors = ['#007aff', '#34c759', '#ff9500', '#ff3b30', '#af52de', '#5ac8fa', '#ffcc00', '#5856d6'];
  const allSubjects = await db.query('subjects') || [];
  const color = flags.color || colors[allSubjects.length % colors.length];

  const res = await db.insert('subjects', {
    name: name.slice(0, 40),
    type,
    color,
    slots: parseInt(flags.slots) || 0,
    sort_order: allSubjects.length,
  });

  success(`Activity "${name}" created (${type})`);
  if (res?.[0]) info(`ID: ${res[0].id}`);
}

async function cmdSubjectUpdate() {
  const name = flags.name || await prompt('Activity name: ');
  const subjects = await db.query('subjects', { name }) || [];
  if (subjects.length === 0) { error(`Activity "${name}" not found.`); return; }

  const subject = subjects[0];
  const updates = {};
  if (flags['new-name']) updates.name = flags['new-name'].slice(0, 40);
  if (flags.color) updates.color = flags.color;
  if (flags.slots) updates.slots = parseInt(flags.slots);

  if (Object.keys(updates).length === 0) {
    const newName = await prompt(`New name [${subject.name}]: `);
    if (newName) updates.name = newName.slice(0, 40);
    const newColor = await prompt(`New color [${subject.color}]: `);
    if (newColor) updates.color = newColor;
  }

  if (Object.keys(updates).length === 0) { warn('Nothing to update.'); return; }

  await db.update('subjects', subject.id, updates);
  success(`Activity "${name}" updated.`);
}

async function cmdSubjectDelete() {
  const name = flags.name || await prompt('Activity name to delete: ');
  const subjects = await db.query('subjects', { name }) || [];
  if (subjects.length === 0) { error(`Activity "${name}" not found.`); return; }

  if (!flags.force) {
    const ok = await confirm(`Delete "${name}" and all associated blocks?`);
    if (!ok) { info('Cancelled.'); return; }
  }

  await db.remove('subjects', subjects[0].id);
  success(`Activity "${name}" deleted.`);
}

async function cmdSubjectShow() {
  const name = flags.name || args[2];
  if (!name) { error('Specify activity name: taketime subjects show --name="..."'); return; }

  const subjects = await db.query('subjects', { name }) || [];
  if (subjects.length === 0) { error(`Activity "${name}" not found.`); return; }

  const subject = subjects[0];
  const items = await db.query('subject_items', { subject_id: subject.id }, '&order=sort_order') || [];
  const typeLabels = { study: 'Study', training: 'Training', inactive: 'Routine' };

  header(`${subject.name} (${typeLabels[subject.type]})`);
  info(`Color: ${subject.color}  |  Slots: ${subject.slots || 0}  |  ID: ${dim(subject.id)}`);

  if (items.length > 0) {
    console.log('');
    if (subject.type === 'study') {
      const rows = items.map(i => [
        i.done ? c.green('✓') : c.gray('○'),
        i.name,
        i.done ? c.green('completed') : dim('pending'),
        dim(i.id.slice(0, 8)),
      ]);
      table(['', 'Topic', 'Status', 'ID'], rows);
    } else if (subject.type === 'training') {
      const rows = items.map(i => [
        i.name,
        i.sets ? `${i.sets} sets` : dim('—'),
        i.reps || dim('—'),
        i.weight || dim('—'),
        dim(i.id.slice(0, 8)),
      ]);
      table(['Exercise', 'Sets', 'Reps', 'Weight', 'ID'], rows);
    } else {
      const rows = items.map(i => [
        i.done ? c.green('✓') : c.gray('○'),
        i.name,
        dim(i.id.slice(0, 8)),
      ]);
      table(['', 'Habit', 'ID'], rows);
    }
  } else {
    info('No items yet. Add with: taketime items add');
  }
}

async function cmdSubjectItems() {
  const name = flags.name || args[2];
  if (name) return cmdSubjectShow();

  // Show all items grouped by subject
  header('All Subject Items');
  const subjects = await db.query('subjects', {}, '&order=sort_order') || [];
  const allItems = await db.query('subject_items', {}, '&order=sort_order') || [];

  for (const s of subjects) {
    const items = allItems.filter(i => i.subject_id === s.id);
    if (items.length === 0) continue;
    console.log(`\n  ${bold(s.name)} ${dim(`(${s.type})`)}`);
    for (const item of items) {
      const check = item.done ? c.green('✓') : c.gray('○');
      const extra = s.type === 'training' && item.sets ? dim(` — ${item.sets}x${item.reps || '?'} ${item.weight || ''}`) : '';
      console.log(`    ${check} ${item.name}${extra} ${dim(item.id.slice(0, 8))}`);
    }
  }
}

// ==================== ITEMS ====================

async function cmdItems() {
  await ensureAuth();

  if (sub === 'add' || sub === 'create') return cmdItemAdd();
  if (sub === 'update' || sub === 'edit') return cmdItemUpdate();
  if (sub === 'delete' || sub === 'rm' || sub === 'remove') return cmdItemRemove();
  if (sub === 'toggle') return cmdItemToggle();

  return cmdSubjectItems();
}

async function cmdItemAdd() {
  const subjectName = flags.subject || await prompt('Activity name: ');
  const subjects = await db.query('subjects', { name: subjectName }) || [];
  if (subjects.length === 0) { error(`Activity "${subjectName}" not found.`); return; }
  const subject = subjects[0];

  const itemName = flags.name || flags.topic || flags.task || await prompt('Item name: ');
  if (!itemName) { error('Item name is required.'); return; }

  const data = { subject_id: subject.id, name: itemName, done: false, sort_order: 0 };
  if (subject.type === 'training') {
    data.sets = parseInt(flags.sets) || null;
    data.reps = flags.reps || null;
    data.weight = flags.weight || null;
  }

  const res = await db.insert('subject_items', data);
  success(`Item "${itemName}" added to "${subjectName}".`);
  if (res?.[0]) info(`ID: ${res[0].id}`);
}

async function cmdItemUpdate() {
  const id = flags.id || await prompt('Item ID: ');
  if (!id) { error('Item ID is required.'); return; }

  const updates = {};
  if (flags.name) updates.name = flags.name;
  if (flags.topic) updates.name = flags.topic;
  if (flags.sets) updates.sets = parseInt(flags.sets);
  if (flags.reps) updates.reps = flags.reps;
  if (flags.weight) updates.weight = flags.weight;
  if (flags.done === 'true') updates.done = true;
  if (flags.done === 'false') updates.done = false;
  if (flags.status === 'completed') updates.done = true;
  if (flags.status === 'pending') updates.done = false;

  if (Object.keys(updates).length === 0) { warn('No updates specified. Use --name, --sets, --reps, --weight, --status'); return; }

  await db.update('subject_items', id, updates);
  success('Item updated.');
}

async function cmdItemRemove() {
  const id = flags.id || await prompt('Item ID: ');
  if (!id) { error('Item ID is required.'); return; }

  if (!flags.force) {
    const ok = await confirm('Delete this item?');
    if (!ok) { info('Cancelled.'); return; }
  }

  await db.remove('subject_items', id);
  success('Item removed.');
}

async function cmdItemToggle() {
  const id = flags.id || await prompt('Item ID: ');
  if (!id) { error('Item ID is required.'); return; }

  const items = await db.query('subject_items', { id }) || [];
  if (items.length === 0) { error('Item not found.'); return; }

  await db.update('subject_items', id, { done: !items[0].done });
  success(`Item ${items[0].done ? 'unmarked' : 'marked as done'}.`);
}

// ==================== BLOCKS ====================

async function cmdBlocks() {
  await ensureAuth();

  if (sub === 'create' || sub === 'add') return cmdBlockCreate();
  if (sub === 'done' || sub === 'complete') return cmdBlockDone();
  if (sub === 'delete' || sub === 'rm') return cmdBlockDelete();
  if (sub === 'update' || sub === 'edit') return cmdBlockUpdate();

  const date = flags.date || today();
  header(`Blocks — ${date}`);

  let blocks = await db.query('blocks', { date }, '&order=start_time') || [];
  const subjects = await db.query('subjects') || [];

  if (blocks.length === 0) {
    info(`No blocks for ${date}.`);
    info('Create one: taketime blocks create');
    return;
  }

  const rows = blocks.map(b => {
    const subj = subjects.find(s => s.id === b.subject_id);
    const time = `${b.start_time?.substring(0, 5)}-${b.end_time?.substring(0, 5)}`;
    const status = b.done ? c.green('✓ Done') : c.yellow('○ Pending');
    const completedCount = (b.completed_items || []).length;
    const extras = [];
    if (b.topic) extras.push(b.topic);
    if (b.repeat_daily) extras.push(dim('↻'));
    if (completedCount > 0) extras.push(dim(`${completedCount} items`));

    return [
      time,
      bold(subj?.name || 'Unknown'),
      extras.join(' '),
      status,
      dim(b.id.slice(0, 8)),
    ];
  });

  table(['Time', 'Activity', 'Details', 'Status', 'ID'], rows);

  const done = blocks.filter(b => b.done).length;
  console.log('');
  info(`Progress: ${progressBar(done, blocks.length, 20)} (${done}/${blocks.length})`);
}

async function cmdBlockCreate() {
  const subjectName = flags.subject || await prompt('Activity name: ');
  const subjects = await db.query('subjects', { name: subjectName }) || [];
  if (subjects.length === 0) { error(`Activity "${subjectName}" not found.`); return; }

  const date = flags.date || await prompt(`Date [${today()}]: `) || today();
  const start = flags.start || await prompt('Start time (HH:MM): ');
  const end = flags.end || await prompt('End time (HH:MM): ');
  const topic = flags.topic || '';

  if (!start || !end) { error('Start and end times are required.'); return; }
  if (start >= end) { error('Start must be before end.'); return; }

  // Check conflicts
  const existing = await db.query('blocks', { date }) || [];
  const conflict = existing.find(b => {
    const bStart = b.start_time?.substring(0, 5);
    const bEnd = b.end_time?.substring(0, 5);
    return bStart < end && bEnd > start;
  });

  if (conflict) {
    const cs = await db.query('subjects', { id: conflict.subject_id });
    error(`Conflict with "${cs?.[0]?.name || 'Unknown'}" (${conflict.start_time?.substring(0, 5)}-${conflict.end_time?.substring(0, 5)})`);
    return;
  }

  const res = await db.insert('blocks', {
    subject_id: subjects[0].id,
    date,
    start_time: start,
    end_time: end,
    topic,
    done: false,
    completed_items: [],
  });

  success(`Block created: ${subjectName} ${start}-${end} on ${date}`);
  if (res?.[0]) info(`ID: ${res[0].id}`);
}

async function cmdBlockDone() {
  const id = flags.id || await prompt('Block ID: ');
  if (!id) { error('Block ID is required.'); return; }

  // Support partial ID match
  let blocks;
  if (id.length < 36) {
    const allBlocks = await db.query('blocks', { date: flags.date || today() }) || [];
    blocks = allBlocks.filter(b => b.id.startsWith(id));
  } else {
    blocks = await db.query('blocks', { id }) || [];
  }

  if (blocks.length === 0) { error('Block not found.'); return; }
  if (blocks.length > 1) { error(`Multiple blocks match "${id}". Be more specific.`); return; }

  const block = blocks[0];
  const newDone = !(block.done);
  await db.update('blocks', block.id, { done: newDone });
  success(`Block ${newDone ? 'completed' : 'uncompleted'}.`);
}

async function cmdBlockUpdate() {
  const id = flags.id || await prompt('Block ID: ');
  if (!id) { error('Block ID is required.'); return; }

  const updates = {};
  if (flags.start) updates.start_time = flags.start;
  if (flags.end) updates.end_time = flags.end;
  if (flags.topic) updates.topic = flags.topic;
  if (flags.date) updates.date = flags.date;
  if (flags.done === 'true') updates.done = true;
  if (flags.done === 'false') updates.done = false;
  if (flags.repeat !== undefined) updates.repeat_daily = flags.repeat === 'true';

  if (Object.keys(updates).length === 0) { warn('No updates. Use --start, --end, --topic, --date, --done, --repeat'); return; }

  await db.update('blocks', id, updates);
  success('Block updated.');
}

async function cmdBlockDelete() {
  const id = flags.id || await prompt('Block ID: ');
  if (!id) { error('Block ID is required.'); return; }

  if (!flags.force) {
    const ok = await confirm('Delete this block?');
    if (!ok) { info('Cancelled.'); return; }
  }

  await db.remove('blocks', id);
  success('Block deleted.');
}

// ==================== SCHEDULE ====================

async function cmdSchedule() {
  await ensureAuth();

  const offset = parseInt(flags.week) || 0;
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);

  const dates = [];
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }

  const weekLabel = offset === 0 ? 'This Week' : offset === 1 ? 'Next Week' : offset === -1 ? 'Last Week' : `Week ${offset > 0 ? '+' : ''}${offset}`;
  header(`Schedule — ${weekLabel} (${dates[0]} → ${dates[6]})`);

  const allBlocks = await db.query('blocks') || [];
  const subjects = await db.query('subjects') || [];
  const weekBlocks = allBlocks.filter(b => b.date >= dates[0] && b.date <= dates[6]);

  for (let i = 0; i < 7; i++) {
    const dateStr = dates[i];
    const isToday = dateStr === today();
    const dayLabel = isToday ? c.bgBlue(` ${dayNames[i]} ${dateStr} `) : bold(`${dayNames[i]} ${dateStr}`);
    const dayBlocks = weekBlocks.filter(b => b.date === dateStr).sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

    console.log('');
    console.log(`  ${dayLabel}`);

    if (dayBlocks.length === 0) {
      console.log(dim('    (no blocks)'));
    } else {
      for (const b of dayBlocks) {
        const subj = subjects.find(s => s.id === b.subject_id);
        const time = `${b.start_time?.substring(0, 5)}-${b.end_time?.substring(0, 5)}`;
        const check = b.done ? c.green('✓') : c.gray('○');
        const name = subj?.name || 'Unknown';
        const topic = b.topic ? dim(` — ${b.topic}`) : '';
        const repeat = b.repeat_daily ? dim(' ↻') : '';
        console.log(`    ${check} ${dim(time)} ${name}${topic}${repeat}`);
      }
    }
  }

  // Summary
  const done = weekBlocks.filter(b => b.done).length;
  const total = weekBlocks.length;
  console.log('');
  info(`Weekly progress: ${progressBar(done, total, 24)} (${done}/${total})`);

  // Minutes per subject
  const subjectMinutes = {};
  weekBlocks.forEach(b => {
    const subj = subjects.find(s => s.id === b.subject_id);
    const name = subj?.name || 'Unknown';
    if (!subjectMinutes[name]) subjectMinutes[name] = 0;
    if (b.start_time && b.end_time) {
      const [sh, sm] = b.start_time.split(':').map(Number);
      const [eh, em] = b.end_time.split(':').map(Number);
      subjectMinutes[name] += (eh * 60 + em) - (sh * 60 + sm);
    }
  });

  if (Object.keys(subjectMinutes).length > 0) {
    console.log('');
    info('Time distribution:');
    const sorted = Object.entries(subjectMinutes).sort((a, b) => b[1] - a[1]);
    for (const [name, mins] of sorted) {
      const hours = Math.floor(mins / 60);
      const m = mins % 60;
      console.log(`    ${name}: ${hours > 0 ? `${hours}h` : ''}${m > 0 ? `${m}min` : ''}`);
    }
  }
}

// ==================== STATS ====================

async function cmdStats() {
  await ensureAuth();

  const period = flags.period || sub || 'week';
  header(`Statistics — ${period.charAt(0).toUpperCase() + period.slice(1)}`);

  let blocks = await db.query('blocks') || [];
  const subjects = await db.query('subjects') || [];
  const todayStr = today();

  if (period === 'today') {
    blocks = blocks.filter(b => b.date === todayStr);
  } else if (period === 'week') {
    const d = new Date();
    const day = d.getDay();
    const mon = new Date(d);
    mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    const start = mon.toISOString().split('T')[0];
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const end = sun.toISOString().split('T')[0];
    blocks = blocks.filter(b => b.date >= start && b.date <= end);
  } else if (period === 'month') {
    const monthStart = todayStr.slice(0, 7) + '-01';
    blocks = blocks.filter(b => b.date >= monthStart && b.date <= todayStr);
  }

  const total = blocks.length;
  const completed = blocks.filter(b => b.done).length;
  const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

  let totalMinutes = 0;
  blocks.forEach(b => {
    if (b.start_time && b.end_time) {
      const [sh, sm] = b.start_time.split(':').map(Number);
      const [eh, em] = b.end_time.split(':').map(Number);
      totalMinutes += (eh * 60 + em) - (sh * 60 + sm);
    }
  });

  // Streak
  let streak = 0;
  const allBlocks = await db.query('blocks') || [];
  const dateSet = new Set(allBlocks.filter(b => b.done).map(b => b.date));
  const checkDate = new Date();
  while (dateSet.has(checkDate.toISOString().split('T')[0])) {
    streak++;
    checkDate.setDate(checkDate.getDate() - 1);
  }

  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;

  console.log('');
  console.log(`  ${bold('Completion')}    ${progressBar(completed, total, 20)} (${completed}/${total})`);
  console.log(`  ${bold('Rate')}          ${rate >= 80 ? c.green(`${rate}%`) : rate >= 50 ? c.yellow(`${rate}%`) : c.red(`${rate}%`)}`);
  console.log(`  ${bold('Time')}          ${hours > 0 ? `${hours}h ` : ''}${mins}min`);
  console.log(`  ${bold('Streak')}        ${streak > 0 ? c.green(`${streak} days 🔥`) : dim('0 days')}`);

  // Top subjects
  const subjectMap = {};
  blocks.forEach(b => {
    const subj = subjects.find(s => s.id === b.subject_id);
    const name = subj?.name || 'Unknown';
    if (!subjectMap[name]) subjectMap[name] = { blocks: 0, minutes: 0, done: 0 };
    subjectMap[name].blocks++;
    if (b.done) subjectMap[name].done++;
    if (b.start_time && b.end_time) {
      const [sh, sm] = b.start_time.split(':').map(Number);
      const [eh, em] = b.end_time.split(':').map(Number);
      subjectMap[name].minutes += (eh * 60 + em) - (sh * 60 + sm);
    }
  });

  const top = Object.entries(subjectMap).sort((a, b) => b[1].blocks - a[1].blocks).slice(0, 5);
  if (top.length > 0) {
    console.log('');
    console.log(`  ${bold('Top Activities')}`);
    const rows = top.map(([name, data]) => {
      const h = Math.floor(data.minutes / 60);
      const m = data.minutes % 60;
      return [name, `${data.blocks} blocks`, `${h > 0 ? `${h}h` : ''}${m > 0 ? `${m}min` : ''}`, progressBar(data.done, data.blocks, 10)];
    });
    table(['Activity', 'Blocks', 'Time', 'Completion'], rows);
  }
}

// ==================== HEATMAP ====================

async function cmdHeatmap() {
  await ensureAuth();

  const numDays = Math.min(parseInt(flags.days) || 90, 365);
  header(`Consistency Heatmap — Last ${numDays} days`);

  const allBlocks = await db.query('blocks') || [];
  const now = new Date();
  const heatmap = {};

  allBlocks.forEach(b => {
    if (!b.date) return;
    let count = b.done ? 1 : 0;
    count += (b.completed_items || []).length;
    if (count > 0) heatmap[b.date] = (heatmap[b.date] || 0) + count;
  });

  let maxCount = 0;
  const days = [];
  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    const count = heatmap[ds] || 0;
    if (count > maxCount) maxCount = count;
    days.push({ date: ds, count, day: d.getDay() });
  }

  // Assign levels
  days.forEach(d => {
    if (maxCount === 0 || d.count === 0) { d.level = 0; return; }
    const ratio = d.count / maxCount;
    d.level = ratio <= 0.25 ? 1 : ratio <= 0.5 ? 2 : ratio <= 0.75 ? 3 : 4;
  });

  // Render as grid (7 rows x N cols, like GitHub)
  const weeks = Math.ceil(days.length / 7);
  const grid = Array.from({ length: 7 }, () => []);
  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  for (let i = 0; i < days.length; i++) {
    // Align to day of week (Mon=0, ..., Sun=6)
    const dow = days[i].day === 0 ? 6 : days[i].day - 1;
    grid[dow].push(days[i]);
  }

  console.log('');
  for (let row = 0; row < 7; row++) {
    const label = row % 2 === 0 ? dayLabels[row] : '   ';
    const cells = grid[row].map(d => heatBlock(d.level)).join('');
    console.log(`  ${dim(label)} ${cells}`);
  }

  console.log('');
  console.log(`  ${dim('░')}=0  ${c.gray('▒')}=low  ${c.yellow('▓')}=med  ${c.green('█')}=high  ${c.brightGreen('█')}=max`);

  // Stats
  const totalTasks = days.reduce((s, d) => s + d.count, 0);
  const activeDays = days.filter(d => d.count > 0).length;
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].count > 0) streak++;
    else break;
  }

  console.log('');
  info(`Active days: ${activeDays}/${numDays} (${Math.round(activeDays / numDays * 100)}%)`);
  info(`Total completions: ${totalTasks}`);
  info(`Current streak: ${streak > 0 ? c.green(`${streak} days`) : dim('0')}`);
}

// ==================== PRIORITIES ====================

async function cmdPriorities() {
  await ensureAuth();

  if (sub === 'add' || sub === 'create') return cmdPriorityAdd();
  if (sub === 'move') return cmdPriorityMove();
  if (sub === 'delete' || sub === 'rm' || sub === 'remove') return cmdPriorityRemove();

  header('Priority Circle');

  const priorities = await db.query('priorities', {}, '&order=sort_order') || [];
  const zones = {
    zone1: { label: 'Zone 1 — Main Focus', icon: '🎯', items: [] },
    zone2: { label: 'Zone 2 — Important', icon: '⭐', items: [] },
    zone3: { label: 'Zone 3 — Flexible', icon: '🔄', items: [] },
    unallocated: { label: 'Unallocated', icon: '📦', items: [] },
  };

  priorities.forEach(p => {
    if (zones[p.zone]) zones[p.zone].items.push(p);
  });

  for (const [zone, data] of Object.entries(zones)) {
    console.log('');
    console.log(`  ${data.icon} ${bold(data.label)}`);
    if (data.items.length === 0) {
      console.log(dim('    (empty)'));
    } else {
      data.items.forEach((item, i) => {
        console.log(`    ${i + 1}. ${item.name} ${dim(item.id.slice(0, 8))}`);
      });
    }
  }
}

async function cmdPriorityAdd() {
  const name = flags.name || await prompt('Priority name: ');
  if (!name) { error('Name is required.'); return; }

  const zone = flags.zone || 'unallocated';
  const validZones = ['zone1', 'zone2', 'zone3', 'unallocated'];
  if (!validZones.includes(zone)) { error(`Invalid zone. Use: ${validZones.join(', ')}`); return; }

  if (zone === 'zone1') {
    const existing = await db.query('priorities', { zone: 'zone1' }) || [];
    if (existing.length >= 3) { error('Zone 1 already has 3 items. Remove one first.'); return; }
  }

  const existing = await db.query('priorities', { zone }) || [];
  const res = await db.insert('priorities', { name, zone, sort_order: existing.length });
  success(`"${name}" added to ${zone}.`);
  if (res?.[0]) info(`ID: ${res[0].id}`);
}

async function cmdPriorityMove() {
  const id = flags.id || await prompt('Priority item ID: ');
  const targetZone = flags.zone || flags.to || await prompt('Target zone [zone1/zone2/zone3/unallocated]: ');

  if (!id || !targetZone) { error('ID and target zone are required.'); return; }

  if (targetZone === 'zone1') {
    const z1 = await db.query('priorities', { zone: 'zone1' }) || [];
    if (z1.length >= 3) { error('Zone 1 already has 3 items.'); return; }
  }

  await db.update('priorities', id, { zone: targetZone });
  success(`Priority moved to ${targetZone}.`);
}

async function cmdPriorityRemove() {
  const id = flags.id || await prompt('Priority item ID: ');
  if (!id) { error('ID is required.'); return; }

  if (!flags.force) {
    const ok = await confirm('Remove this priority item?');
    if (!ok) { info('Cancelled.'); return; }
  }

  await db.remove('priorities', id);
  success('Priority item removed.');
}

// ==================== SETTINGS ====================

async function cmdSettings() {
  await ensureAuth();

  if (sub === 'set' || sub === 'update') return cmdSettingsUpdate();

  header('Settings');

  const profiles = await db.query('profiles', {}) || [];
  const profile = profiles[0] || {};

  const settings = [
    ['Theme', profile.theme || 'auto'],
    ['Language', profile.language || 'pt-BR'],
    ['Timezone', profile.timezone || 'America/Sao_Paulo'],
    ['Notifications', profile.notifications ? c.green('ON') : dim('OFF')],
    ['Reminder (min)', String(profile.reminder_min ?? 10)],
    ['Show Marquee', profile.show_marquee !== false ? c.green('ON') : dim('OFF')],
  ];

  table(['Setting', 'Value'], settings);
}

async function cmdSettingsUpdate() {
  const updates = {};
  if (flags.theme) updates.theme = flags.theme;
  if (flags.language || flags.lang) updates.language = flags.language || flags.lang;
  if (flags.timezone || flags.tz) updates.timezone = flags.timezone || flags.tz;
  if (flags.notifications !== undefined) updates.notifications = flags.notifications === 'true';
  if (flags.reminder) updates.reminder_min = parseInt(flags.reminder);
  if (flags.marquee !== undefined) updates.show_marquee = flags.marquee === 'true';

  if (Object.keys(updates).length === 0) {
    warn('Specify settings to update:');
    info('  --theme=dark|light|auto');
    info('  --language=pt-BR|en-US');
    info('  --timezone="America/Sao_Paulo"');
    info('  --notifications=true|false');
    info('  --reminder=10');
    info('  --marquee=true|false');
    return;
  }

  const profiles = await db.query('profiles', {}) || [];
  if (profiles.length === 0) { error('Profile not found.'); return; }

  await db.update('profiles', db.userId, updates);
  success('Settings updated.');
}

// ==================== LOGS ====================

async function cmdLogs() {
  await ensureAuth();

  const limit = parseInt(flags.limit) || 20;
  header(`Activity Log (last ${limit})`);

  const logs = await db.query('logs', {}, `&order=created_at.desc&limit=${limit}`) || [];

  if (logs.length === 0) {
    info('No activity logs yet.');
    return;
  }

  for (const log of logs) {
    const time = new Date(log.created_at).toLocaleString();
    const detail = log.detail ? dim(` — ${log.detail}`) : '';
    console.log(`  ${dim(time)}  ${log.action}${detail}`);
  }
}

// ==================== TODAY ====================

async function cmdToday() {
  await ensureAuth();

  const todayStr = today();
  header(`Today — ${todayStr}`);

  const [blocks, subjects, priorities] = await Promise.all([
    db.query('blocks', { date: todayStr }, '&order=start_time'),
    db.query('subjects'),
    db.query('priorities', {}, '&order=sort_order'),
  ]);

  const allBlocks = blocks || [];
  const done = allBlocks.filter(b => b.done).length;

  // Timeline
  console.log('');
  console.log(bold('  Timeline'));

  if (allBlocks.length === 0) {
    console.log(dim('    No blocks scheduled for today.'));
  } else {
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    for (const b of allBlocks) {
      const subj = (subjects || []).find(s => s.id === b.subject_id);
      const [sh, sm] = (b.start_time || '00:00').split(':').map(Number);
      const [eh, em] = (b.end_time || '00:00').split(':').map(Number);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;

      let indicator;
      if (b.done) indicator = c.green('✓');
      else if (nowMinutes >= startMin && nowMinutes < endMin) indicator = c.bgBlue(' NOW ');
      else if (nowMinutes < startMin) indicator = c.gray('○');
      else indicator = c.yellow('○');

      const time = `${b.start_time?.substring(0, 5)}-${b.end_time?.substring(0, 5)}`;
      const topic = b.topic ? dim(` — ${b.topic}`) : '';
      console.log(`    ${indicator} ${dim(time)} ${subj?.name || 'Unknown'}${topic}`);
    }
  }

  console.log('');
  info(`Progress: ${progressBar(done, allBlocks.length, 20)} (${done}/${allBlocks.length})`);

  // Main focus
  const zone1 = (priorities || []).filter(p => p.zone === 'zone1');
  if (zone1.length > 0) {
    console.log('');
    console.log(bold('  🎯 Main Focus'));
    zone1.forEach(p => console.log(`    • ${p.name}`));
  }
}

// ==================== QUICK ADD ====================

async function cmdQuick() {
  await ensureAuth();
  // Quick block creation: taketime quick "Treino" 07:00 07:40
  const name = args[1];
  const start = args[2];
  const end = args[3];

  if (!name || !start || !end) {
    error('Usage: taketime quick "Activity Name" HH:MM HH:MM [--date=YYYY-MM-DD]');
    return;
  }

  const date = flags.date || today();
  const subjects = await db.query('subjects', { name }) || [];
  if (subjects.length === 0) { error(`Activity "${name}" not found.`); return; }

  // Check conflicts
  const existing = await db.query('blocks', { date }) || [];
  const conflict = existing.find(b => {
    const bStart = b.start_time?.substring(0, 5);
    const bEnd = b.end_time?.substring(0, 5);
    return bStart < end && bEnd > start;
  });
  if (conflict) {
    error(`Conflict with existing block (${conflict.start_time?.substring(0, 5)}-${conflict.end_time?.substring(0, 5)})`);
    return;
  }

  await db.insert('blocks', {
    subject_id: subjects[0].id,
    date,
    start_time: start,
    end_time: end,
    topic: flags.topic || '',
    done: false,
    completed_items: [],
  });

  success(`${name} ${start}-${end} on ${date}`);
}

// ==================== HELP ====================

function cmdHelp() {
  banner();
  console.log(bold('  Take Time CLI') + dim(' — manage your schedule from the terminal'));
  console.log('');

  const cmds = [
    [bold('Auth'), ''],
    ['  login', 'Authenticate with email/password'],
    ['  logout', 'Clear session'],
    ['  status', 'Show connection and account status'],
    ['', ''],
    [bold('Daily'), ''],
    ['  today', 'Show today\'s timeline, progress, and focus'],
    ['  quick <name> HH:MM HH:MM', 'Quick block creation'],
    ['', ''],
    [bold('Schedule'), ''],
    ['  schedule', 'Show weekly schedule [--week=0]'],
    ['  blocks', 'List blocks for a date [--date=YYYY-MM-DD]'],
    ['  blocks create', 'Create a block (interactive)'],
    ['  blocks done --id=<id>', 'Toggle block completion'],
    ['  blocks update --id=<id>', 'Update block fields'],
    ['  blocks delete --id=<id>', 'Delete a block'],
    ['', ''],
    [bold('Activities'), ''],
    ['  subjects', 'List all activities'],
    ['  subjects create', 'Create a new activity'],
    ['  subjects show --name="..."', 'Show activity details and items'],
    ['  subjects update --name="..."', 'Update an activity'],
    ['  subjects delete --name="..."', 'Delete an activity'],
    ['', ''],
    [bold('Items'), ''],
    ['  items', 'List all items by subject'],
    ['  items add --subject="..." --name="..."', 'Add item to subject'],
    ['  items update --id=<id>', 'Update an item'],
    ['  items toggle --id=<id>', 'Toggle item completion'],
    ['  items remove --id=<id>', 'Remove an item'],
    ['', ''],
    [bold('Priorities'), ''],
    ['  priorities', 'Show priority circle'],
    ['  priorities add --name="..." [--zone=zone1]', 'Add priority item'],
    ['  priorities move --id=<id> --zone=zone2', 'Move between zones'],
    ['  priorities remove --id=<id>', 'Remove priority item'],
    ['', ''],
    [bold('Analytics'), ''],
    ['  stats [today|week|month|all]', 'Show completion stats'],
    ['  heatmap [--days=90]', 'Show consistency heatmap'],
    ['', ''],
    [bold('Config'), ''],
    ['  settings', 'Show current settings'],
    ['  settings set --theme=dark ...', 'Update settings'],
    ['  logs [--limit=20]', 'View activity log'],
  ];

  for (const [cmd, desc] of cmds) {
    if (!desc) { console.log(`  ${cmd}`); continue; }
    console.log(`  ${c.cyan(cmd.padEnd(40))} ${dim(desc)}`);
  }

  console.log('');
  console.log(dim('  App: https://taketime.space'));
  console.log(dim('  Docs: https://docs.taketime.space'));
  console.log('');
}

// ==================== ROUTER ====================

async function main() {
  try {
    switch (cmd) {
      case 'login':       return cmdLogin();
      case 'logout':      return cmdLogout();
      case 'status':      return cmdStatus();
      case 'today':
      case 'td':          return cmdToday();
      case 'quick':
      case 'q':           return cmdQuick();
      case 'schedule':
      case 'sched':
      case 'week':        return cmdSchedule();
      case 'blocks':
      case 'block':
      case 'b':           return cmdBlocks();
      case 'subjects':
      case 'subject':
      case 'sub':
      case 'activities':  return cmdSubjects();
      case 'items':
      case 'item':
      case 'i':           return cmdItems();
      case 'priorities':
      case 'priority':
      case 'prio':        return cmdPriorities();
      case 'stats':
      case 'stat':        return cmdStats();
      case 'heatmap':
      case 'heat':        return cmdHeatmap();
      case 'settings':
      case 'config':      return cmdSettings();
      case 'logs':
      case 'log':         return cmdLogs();
      case 'help':
      case '--help':
      case '-h':          return cmdHelp();
      case 'version':
      case '--version':
      case '-v':
        console.log('Take Time CLI v1.0.0');
        return;
      default:
        if (!cmd) return cmdHelp();
        error(`Unknown command: ${cmd}`);
        info('Run: taketime help');
        process.exit(1);
    }
  } catch (e) {
    error(e.message);
    if (process.env.DEBUG) console.error(e);
    process.exit(1);
  }
}

main();
