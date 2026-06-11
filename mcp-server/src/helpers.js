// Helper functions for working with the Take Time state JSON blob

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export function validateDate(d) {
  if (!DATE_RE.test(d)) throw new Error(`Invalid date "${d}". Use YYYY-MM-DD format.`);
  const parsed = new Date(d + 'T00:00:00');
  if (isNaN(parsed.getTime())) throw new Error(`Invalid date "${d}".`);
}

export function validateTime(t) {
  if (!TIME_RE.test(t)) throw new Error(`Invalid time "${t}". Use HH:MM format.`);
  const [h, m] = t.split(':').map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) throw new Error(`Invalid time "${t}".`);
}

export function getBlocksForDate(state, date) {
  return (state.blocks || []).filter(b => b.date === date);
}

export function getBlocksInRange(state, from, to) {
  return (state.blocks || []).filter(b => b.date >= from && b.date <= to);
}

export function getSubjectById(state, id) {
  return (state.subjects || []).find(s => s.id === id);
}

export function getSubjectByName(state, name) {
  return (state.subjects || []).find(s => s.name.toLowerCase() === name.toLowerCase());
}

export function getCurrentWeekDates(offset = 0) {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);

  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return { start: dates[0], end: dates[6], dates };
}

export function computeStats(state, period) {
  let blocks = state.blocks || [];
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  if (period === 'today') {
    blocks = blocks.filter(b => b.date === today);
  } else if (period === 'week') {
    const { start, end } = getCurrentWeekDates();
    blocks = blocks.filter(b => b.date >= start && b.date <= end);
  } else if (period === 'month') {
    const monthStart = today.slice(0, 7) + '-01';
    blocks = blocks.filter(b => b.date >= monthStart && b.date <= today);
  }

  const total = blocks.length;
  const completed = blocks.filter(b => b.done).length;
  const rate = total > 0 ? Math.round((completed / total) * 100) / 100 : 0;

  // Total minutes
  let totalMinutes = 0;
  blocks.forEach(b => {
    if (b.start && b.end) {
      const [sh, sm] = b.start.split(':').map(Number);
      const [eh, em] = b.end.split(':').map(Number);
      totalMinutes += (eh * 60 + em) - (sh * 60 + sm);
    }
  });

  // Heatmap
  const heatmap = {};
  blocks.forEach(b => {
    if (b.date) {
      const count = b.done ? 1 : 0;
      const itemCount = (b.completedItems || []).length;
      heatmap[b.date] = (heatmap[b.date] || 0) + count + itemCount;
    }
  });

  // Streak
  let streak = 0;
  const dateSet = new Set(blocks.filter(b => b.done).map(b => b.date));
  const checkDate = new Date(now);
  while (true) {
    const ds = checkDate.toISOString().split('T')[0];
    if (dateSet.has(ds)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  // Top subjects — resolve name via state.subjects
  const subjectMap = {};
  blocks.forEach(b => {
    const subject = getSubjectById(state, b.subjectId);
    const name = subject?.name || 'Unknown';
    if (!subjectMap[name]) subjectMap[name] = { name, blocks: 0, minutes: 0 };
    subjectMap[name].blocks++;
    if (b.start && b.end) {
      const [sh, sm] = b.start.split(':').map(Number);
      const [eh, em] = b.end.split(':').map(Number);
      subjectMap[name].minutes += (eh * 60 + em) - (sh * 60 + sm);
    }
  });
  const topSubjects = Object.values(subjectMap).sort((a, b) => b.blocks - a.blocks).slice(0, 5);

  return {
    total_blocks: total,
    completed_blocks: completed,
    completion_rate: rate,
    streak_days: streak,
    total_minutes: totalMinutes,
    heatmap,
    top_subjects: topSubjects,
  };
}

export function formatBlock(block, state) {
  const subject = getSubjectById(state, block.subjectId);
  return {
    id: block.id,
    subject_id: block.subjectId,
    subject_name: subject?.name || 'Unknown',
    date: block.date,
    start: block.start,
    end: block.end,
    topic: block.topic || null,
    done: !!block.done,
    completed_items: block.completedItems || [],
  };
}

export function formatSubject(subject) {
  const result = {
    id: subject.id,
    name: subject.name,
    type: subject.type,
    color: subject.color,
    slots: subject.slots || [],
  };

  if (subject.type === 'study') {
    result.syllabus = subject.syllabus || [];
  } else if (subject.type === 'training') {
    result.exercises = subject.exercises || [];
  } else if (subject.type === 'inactive') {
    result.habits = subject.routines || subject.habits || [];
  }

  return result;
}
