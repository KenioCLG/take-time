#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { SupabaseClient } from './supabase.js';
import {
  uid, getBlocksForDate, getBlocksInRange, getSubjectById, getSubjectByName,
  getCurrentWeekDates, computeStats, formatBlock, formatSubject,
  validateDate, validateTime, validatePillar,
  getSubjectItems, getSubjectItemById,
  addSubjectItem, removeSubjectItem, updateSubjectItem,
  getPriorityItemById, formatLog,
} from './helpers.js';

// --- Auth ---
const refreshToken = process.env.TAKETIME_REFRESH_TOKEN;
const accessToken = process.env.TAKETIME_ACCESS_TOKEN || process.env.TAKETIME_API_KEY;
const email = process.env.TAKETIME_EMAIL;
const password = process.env.TAKETIME_PASSWORD;

if (!refreshToken && !accessToken && (!email || !password)) {
  console.error('Error: Set TAKETIME_REFRESH_TOKEN (recommended — copy from app settings)');
  console.error('       or TAKETIME_EMAIL + TAKETIME_PASSWORD');
  process.exit(1);
}

const db = new SupabaseClient(accessToken || 'pending');

// --- State helpers ---
async function getState() {
  const state = await db.loadState();
  if (!state) throw new Error('No data found. Make sure you have logged into the Take Time app at least once.');
  return state;
}

async function updateState(mutator) {
  const state = await getState();
  mutator(state);
  await db.saveState(state);
  return state;
}

// --- MCP Server ---
const server = new McpServer({
  name: 'taketime',
  version: '1.0.0',
});

// ==================== READ TOOLS ====================

server.tool(
  'list_blocks',
  'List study blocks with optional date and status filters. Returns blocks for today by default.',
  {
    date: z.string().optional().describe('Filter by specific date (YYYY-MM-DD). Defaults to today.'),
    date_from: z.string().optional().describe('Start of date range (YYYY-MM-DD)'),
    date_to: z.string().optional().describe('End of date range (YYYY-MM-DD)'),
    subject_name: z.string().optional().describe('Filter by subject/activity name'),
    done: z.boolean().optional().describe('Filter by completion status'),
  },
  async ({ date, date_from, date_to, subject_name, done }) => {
    const state = await getState();
    let blocks;

    if (date_from && date_to) {
      blocks = getBlocksInRange(state, date_from, date_to);
    } else {
      const targetDate = date || new Date().toISOString().split('T')[0];
      blocks = getBlocksForDate(state, targetDate);
    }

    if (subject_name) {
      const subject = getSubjectByName(state, subject_name);
      if (subject) blocks = blocks.filter(b => b.subjectId === subject.id);
    }

    if (done !== undefined) {
      blocks = blocks.filter(b => !!b.done === done);
    }

    blocks.sort((a, b) => a.start.localeCompare(b.start));
    const formatted = blocks.map(b => formatBlock(b, state));

    return {
      content: [{
        type: 'text',
        text: formatted.length > 0
          ? JSON.stringify(formatted, null, 2)
          : 'No blocks found for the specified criteria.',
      }],
    };
  }
);

server.tool(
  'list_subjects',
  'List all activities (study, training, routine) with their profiles, slots, content items, and completion counts.',
  {
    type: z.enum(['study', 'training', 'inactive']).optional().describe('Filter by type'),
    include_items: z.boolean().optional().describe('Include full item details (default: true). Set false for compact view.'),
  },
  async ({ type, include_items }) => {
    const state = await getState();
    let subjects = state.subjects || [];

    if (type) subjects = subjects.filter(s => s.type === type);

    const formatted = subjects.map(s => {
      const f = formatSubject(s);
      if (include_items === false) {
        delete f.syllabus;
        delete f.exercises;
        delete f.habits;
      }
      return f;
    });

    return {
      content: [{
        type: 'text',
        text: formatted.length > 0
          ? JSON.stringify(formatted, null, 2)
          : 'No activities found.',
      }],
    };
  }
);

server.tool(
  'get_stats',
  'Get completion statistics, streaks, heatmap data, and top subjects.',
  {
    period: z.enum(['today', 'week', 'month', 'all']).optional().describe('Time period (default: week)'),
  },
  async ({ period }) => {
    const state = await getState();
    const stats = computeStats(state, period || 'week');

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(stats, null, 2),
      }],
    };
  }
);

server.tool(
  'get_schedule',
  'Get the full weekly schedule with all blocks organized by day.',
  {
    week_offset: z.number().optional().describe('0 = current week, -1 = last week, 1 = next week'),
  },
  async ({ week_offset }) => {
    const state = await getState();
    const { start, end, dates } = getCurrentWeekDates(week_offset || 0);
    const blocks = getBlocksInRange(state, start, end);

    const days = {};
    dates.forEach(d => { days[d] = []; });
    blocks.forEach(b => {
      if (days[b.date]) {
        days[b.date].push(formatBlock(b, state));
      }
    });

    Object.values(days).forEach(dayBlocks => {
      dayBlocks.sort((a, b) => a.start.localeCompare(b.start));
    });

    const totalBlocks = blocks.length;
    const completed = blocks.filter(b => b.done).length;

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          week_start: start,
          week_end: end,
          days,
          summary: { total_blocks: totalBlocks, completed, pending: totalBlocks - completed },
        }, null, 2),
      }],
    };
  }
);

server.tool(
  'get_heatmap',
  'Get the consistency heatmap — daily task completion counts for the last 90 days with intensity levels (0-4).',
  {
    days: z.number().optional().describe('Number of days to include (default: 90, max: 365)'),
  },
  async ({ days }) => {
    const state = await getState();
    const numDays = Math.min(days || 90, 365);
    const now = new Date();
    const heatmap = {};

    // Build daily counts from all blocks
    (state.blocks || []).forEach(b => {
      if (!b.date) return;
      let count = b.done ? 1 : 0;
      count += (b.completedItems || []).length;
      if (count > 0) heatmap[b.date] = (heatmap[b.date] || 0) + count;
    });

    // Build the last N days with levels
    const result = [];
    let maxCount = 0;
    const dates = [];
    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      dates.push(ds);
      const count = heatmap[ds] || 0;
      if (count > maxCount) maxCount = count;
    }

    // Assign levels 0-4 based on relative intensity
    dates.forEach(ds => {
      const count = heatmap[ds] || 0;
      let level = 0;
      if (maxCount > 0 && count > 0) {
        const ratio = count / maxCount;
        if (ratio <= 0.25) level = 1;
        else if (ratio <= 0.5) level = 2;
        else if (ratio <= 0.75) level = 3;
        else level = 4;
      }
      result.push({ date: ds, count, level });
    });

    // Streak calculation
    let streak = 0;
    for (let i = result.length - 1; i >= 0; i--) {
      if (result[i].count > 0) streak++;
      else break;
    }

    const totalTasks = result.reduce((s, d) => s + d.count, 0);
    const activeDays = result.filter(d => d.count > 0).length;

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          period_days: numDays,
          total_tasks_completed: totalTasks,
          active_days: activeDays,
          current_streak: streak,
          max_daily: maxCount,
          days: result,
        }, null, 2),
      }],
    };
  }
);

server.tool(
  'get_priorities',
  'Get the Priority Circle — activities organized by priority zone (Main Focus, Important, Flexible, Unallocated).',
  {},
  async () => {
    const state = await getState();
    const priorities = state.priorities || {};
    const subjects = state.subjects || [];

    function resolveZone(ids) {
      return (ids || []).map(id => {
        const s = getSubjectById(state, id);
        return s ? { id: s.id, name: s.name, type: s.type, color: s.color } : { id, name: 'Unknown' };
      });
    }

    const allocatedIds = new Set([
      ...(priorities.zone1 || []),
      ...(priorities.zone2 || []),
      ...(priorities.zone3 || []),
    ]);
    const unallocated = subjects
      .filter(s => !allocatedIds.has(s.id))
      .map(s => ({ id: s.id, name: s.name, type: s.type, color: s.color }));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          zone1_main_focus: resolveZone(priorities.zone1),
          zone2_important: resolveZone(priorities.zone2),
          zone3_flexible: resolveZone(priorities.zone3),
          unallocated,
        }, null, 2),
      }],
    };
  }
);

// ==================== WRITE TOOLS ====================

server.tool(
  'create_block',
  'Create a new study block on the schedule. Specify subject by name.',
  {
    subject_name: z.string().describe('Name of the activity/subject'),
    date: z.string().describe('Date (YYYY-MM-DD)'),
    start: z.string().describe('Start time (HH:MM)'),
    end: z.string().describe('End time (HH:MM)'),
    topic: z.string().optional().describe('Optional topic name'),
  },
  async ({ subject_name, date, start, end, topic }) => {
    validateDate(date);
    validateTime(start);
    validateTime(end);

    const state = await updateState(s => {
      const subject = getSubjectByName(s, subject_name);
      if (!subject) throw new Error(`Subject "${subject_name}" not found. Use list_subjects to see available activities.`);

      if (start >= end) throw new Error('Start time must be before end time.');

      const existing = getBlocksForDate(s, date);
      const conflict = existing.find(b => b.start < end && b.end > start);
      if (conflict) {
        const conflictSubject = getSubjectById(s, conflict.subjectId);
        throw new Error(`Time conflict with "${conflictSubject?.name || 'Unknown'}" block (${conflict.start}-${conflict.end}).`);
      }

      const block = {
        id: uid(),
        subjectId: subject.id,
        date,
        start,
        end,
        topic: topic || '',
        done: false,
        completedItems: [],
      };

      s.blocks.push(block);
    });

    const newBlock = state.blocks[state.blocks.length - 1];
    return {
      content: [{
        type: 'text',
        text: `Block created: ${subject_name} on ${date} from ${start} to ${end}${topic ? ` — ${topic}` : ''}\n\n${JSON.stringify(formatBlock(newBlock, state), null, 2)}`,
      }],
    };
  }
);

server.tool(
  'update_block',
  'Update an existing block. Use to mark as done, change time, syllabus topic, toggle repeat daily, etc.',
  {
    block_id: z.string().describe('Block ID to update'),
    start: z.string().optional().describe('New start time (HH:MM)'),
    end: z.string().optional().describe('New end time (HH:MM)'),
    topic: z.string().optional().describe('New topic text'),
    done: z.boolean().optional().describe('Mark as done or undone'),
    selected_syllabus_id: z.string().optional().describe('Set the active syllabus topic ID for this block'),
    repeat_daily: z.boolean().optional().describe('Toggle daily auto-repeat'),
  },
  async ({ block_id, start, end, topic, done, selected_syllabus_id, repeat_daily }) => {
    if (start !== undefined) validateTime(start);
    if (end !== undefined) validateTime(end);

    let updatedBlock;

    const state = await updateState(s => {
      const block = s.blocks.find(b => b.id === block_id);
      if (!block) throw new Error(`Block "${block_id}" not found.`);

      if (start !== undefined) block.start = start;
      if (end !== undefined) block.end = end;
      if (topic !== undefined) block.topic = topic;
      if (done !== undefined) block.done = done;
      if (selected_syllabus_id !== undefined) block.selectedSyllabusId = selected_syllabus_id;
      if (repeat_daily !== undefined) block.repeatDaily = repeat_daily;

      updatedBlock = block;
    });

    return {
      content: [{
        type: 'text',
        text: `Block updated successfully.\n\n${JSON.stringify(formatBlock(updatedBlock, state), null, 2)}`,
      }],
    };
  }
);

server.tool(
  'delete_block',
  'Permanently delete a study block.',
  {
    block_id: z.string().describe('Block ID to delete'),
  },
  async ({ block_id }) => {
    await updateState(s => {
      const idx = s.blocks.findIndex(b => b.id === block_id);
      if (idx === -1) throw new Error(`Block "${block_id}" not found.`);
      s.blocks.splice(idx, 1);
    });

    return {
      content: [{
        type: 'text',
        text: `Block ${block_id} deleted successfully.`,
      }],
    };
  }
);

server.tool(
  'create_subject',
  'Create a new activity profile (study, training, or routine).',
  {
    name: z.string().describe('Activity name (max 40 chars)'),
    type: z.enum(['study', 'training', 'inactive']).describe('study, training, or inactive (routine)'),
    color: z.string().optional().describe('Hex color (e.g. #6366f1). Auto-assigned if omitted.'),
    slots: z.array(z.object({
      start: z.string().describe('Slot start time (HH:MM)'),
      end: z.string().describe('Slot end time (HH:MM)'),
    })).optional().describe('Preferred time slots for this activity'),
  },
  async ({ name, type, color, slots }) => {
    const colors = ['#007aff', '#34c759', '#ff9500', '#ff3b30', '#af52de', '#5ac8fa', '#ffcc00', '#5856d6'];

    const state = await updateState(s => {
      const existing = getSubjectByName(s, name);
      if (existing) throw new Error(`Activity "${name}" already exists.`);

      const subject = {
        id: uid(),
        name: name.slice(0, 40),
        type,
        color: color || colors[s.subjects.length % colors.length],
        slots: slots || [],
        syllabus: type === 'study' ? [] : undefined,
        exercises: type === 'training' ? [] : undefined,
        routines: type === 'inactive' ? [] : undefined,
      };

      s.subjects.push(subject);
    });

    const newSubject = state.subjects[state.subjects.length - 1];
    return {
      content: [{
        type: 'text',
        text: `Activity created: "${name}" (${type})\n\n${JSON.stringify(formatSubject(newSubject), null, 2)}`,
      }],
    };
  }
);

// ==================== SUBJECT CONTENT TOOLS ====================

server.tool(
  'add_subject_item',
  'Add a content item to a subject — syllabus topic (study), exercise (training), or micro-habit (routine).',
  {
    subject_name: z.string().describe('Name of the activity/subject'),
    topic: z.string().optional().describe('Syllabus topic name (for study subjects)'),
    description: z.string().optional().describe('Syllabus topic description (for study subjects)'),
    duration: z.number().optional().describe('Estimated time in minutes (for study subjects)'),
    unit: z.enum(['min', 'rep']).optional().describe('Duration unit: min or rep (for study subjects)'),
    name: z.string().optional().describe('Exercise name (for training subjects)'),
    sets: z.number().optional().describe('Number of sets (for training subjects)'),
    reps: z.number().optional().describe('Repetitions per set (for training subjects)'),
    weight: z.string().optional().describe('Weight used (for training subjects)'),
    task: z.string().optional().describe('Micro-habit task description (for routine subjects)'),
  },
  async ({ subject_name, topic, description, duration, unit, name, sets, reps, weight, task }) => {
    const state = await getState();
    const subject = getSubjectByName(state, subject_name);
    if (!subject) throw new Error(`Subject "${subject_name}" not found.`);

    let item;
    if (subject.type === 'study') {
      if (!topic) throw new Error('"topic" is required for study subjects.');
      item = addSubjectItem(subject, { topic, description: description || '', duration, unit: unit || 'min', status: 'pending' });
    } else if (subject.type === 'training') {
      if (!name) throw new Error('"name", "sets", "reps" are required for training subjects.');
      item = addSubjectItem(subject, { name, sets: sets || 3, reps: reps || 10, weight: weight || '' });
    } else {
      if (!task) throw new Error('"task" is required for routine subjects.');
      item = addSubjectItem(subject, { task });
    }

    await db.saveState(state);

    return {
      content: [{
        type: 'text',
        text: `Item added to "${subject_name}":\n\n${JSON.stringify(item, null, 2)}`,
      }],
    };
  }
);

server.tool(
  'remove_subject_item',
  'Permanently remove a content item (syllabus topic, exercise, or micro-habit) from a subject.',
  {
    subject_name: z.string().describe('Name of the activity/subject'),
    item_id: z.string().describe('ID of the item to remove'),
  },
  async ({ subject_name, item_id }) => {
    const state = await getState();
    const subject = getSubjectByName(state, subject_name);
    if (!subject) throw new Error(`Subject "${subject_name}" not found.`);

    const item = getSubjectItemById(subject, item_id);
    if (!item) throw new Error(`Item "${item_id}" not found in subject "${subject_name}".`);

    removeSubjectItem(subject, item_id);
    await db.saveState(state);

    return {
      content: [{
        type: 'text',
        text: `Item removed from "${subject_name}".`,
      }],
    };
  }
);

server.tool(
  'update_subject_item',
  'Update a content item — change topic, duration, exercise parameters, or habit task.',
  {
    subject_name: z.string().describe('Name of the activity/subject'),
    item_id: z.string().describe('ID of the item to update'),
    topic: z.string().optional().describe('New syllabus topic name'),
    description: z.string().optional().describe('New description'),
    duration: z.number().optional().describe('New estimated time in minutes'),
    unit: z.enum(['min', 'rep']).optional().describe('Duration unit'),
    status: z.enum(['pending', 'completed']).optional().describe('Syllabus topic status'),
    name: z.string().optional().describe('New exercise name'),
    sets: z.number().optional().describe('New sets count'),
    reps: z.number().optional().describe('New reps count'),
    weight: z.string().optional().describe('New weight'),
    task: z.string().optional().describe('New micro-habit task'),
  },
  async ({ subject_name, item_id, topic, description, duration, unit, status, name, sets, reps, weight, task }) => {
    const state = await getState();
    const subject = getSubjectByName(state, subject_name);
    if (!subject) throw new Error(`Subject "${subject_name}" not found.`);

    const updates = {};
    if (topic !== undefined) updates.topic = topic;
    if (description !== undefined) updates.description = description;
    if (duration !== undefined) updates.duration = duration;
    if (unit !== undefined) updates.unit = unit;
    if (status !== undefined) updates.status = status;
    if (name !== undefined) updates.name = name;
    if (sets !== undefined) updates.sets = sets;
    if (reps !== undefined) updates.reps = reps;
    if (weight !== undefined) updates.weight = weight;
    if (task !== undefined) updates.task = task;

    const updated = updateSubjectItem(subject, item_id, updates);
    await db.saveState(state);

    return {
      content: [{
        type: 'text',
        text: `Item updated in "${subject_name}":\n\n${JSON.stringify(updated, null, 2)}`,
      }],
    };
  }
);

server.tool(
  'update_subject',
  'Update subject properties — rename, change color, reorder slots, etc.',
  {
    subject_name: z.string().describe('Current name of the activity/subject'),
    new_name: z.string().optional().describe('New name (max 40 chars)'),
    color: z.string().optional().describe('New hex color'),
    slots: z.array(z.object({
      start: z.string().describe('Slot start time (HH:MM)'),
      end: z.string().describe('Slot end time (HH:MM)'),
    })).optional().describe('Replacement time slots array'),
  },
  async ({ subject_name, new_name, color, slots }) => {
    const state = await getState();
    const subject = getSubjectByName(state, subject_name);
    if (!subject) throw new Error(`Subject "${subject_name}" not found.`);

    if (new_name !== undefined) subject.name = new_name.slice(0, 40);
    if (color !== undefined) subject.color = color;
    if (slots !== undefined) subject.slots = slots;

    await db.saveState(state);

    return {
      content: [{
        type: 'text',
        text: `Subject updated:\n\n${JSON.stringify(formatSubject(subject), null, 2)}`,
      }],
    };
  }
);

server.tool(
  'delete_subject',
  'Permanently delete an activity/subject and all its associated blocks.',
  {
    subject_name: z.string().describe('Name of the activity/subject to delete'),
  },
  async ({ subject_name }) => {
    let deletedBlocks = 0;

    await updateState(s => {
      const subject = getSubjectByName(s, subject_name);
      if (!subject) throw new Error(`Subject "${subject_name}" not found.`);

      // Remove all blocks for this subject
      const before = s.blocks.length;
      s.blocks = s.blocks.filter(b => b.subjectId !== subject.id);
      deletedBlocks = before - s.blocks.length;

      // Remove from priorities
      if (s.priorities) {
        for (const zone of ['zone1', 'zone2', 'zone3', 'unallocated']) {
          if (s.priorities[zone]) {
            s.priorities[zone] = s.priorities[zone].filter(i => i.id !== subject.id);
          }
        }
      }

      // Remove the subject
      s.subjects = s.subjects.filter(sub => sub.id !== subject.id);
    });

    return {
      content: [{
        type: 'text',
        text: `Subject "${subject_name}" deleted. ${deletedBlocks} associated block(s) also removed.`,
      }],
    };
  }
);

// ==================== BLOCK ATOMIC ITEM TOOL ====================

server.tool(
  'toggle_block_item',
  'Mark or unmark a content item (exercise or micro-habit) as completed within a block. This is the atomic habit tracker — it also auto-completes the block when ALL items are done, matching the app behavior.',
  {
    block_id: z.string().describe('Block ID to update'),
    item_id: z.string().describe('Item ID (exercise ID or habit ID) from the subject\'s content'),
  },
  async ({ block_id, item_id }) => {
    let result;

    const state = await updateState(s => {
      const block = s.blocks.find(b => b.id === block_id);
      if (!block) throw new Error(`Block "${block_id}" not found.`);

      const subject = getSubjectById(s, block.subjectId);
      if (!subject) throw new Error('Block subject not found.');

      if (!block.completedItems) block.completedItems = [];

      const wasChecked = block.completedItems.includes(item_id);
      if (wasChecked) {
        block.completedItems = block.completedItems.filter(id => id !== item_id);
      } else {
        block.completedItems.push(item_id);
      }

      // Auto-complete block if all items are done
      const total = getSubjectItems(subject).length;
      if (total > 0 && block.completedItems.length === total) {
        block.done = true;
      } else if (wasChecked) {
        block.done = false;
      }

      result = { block_id: block.id, item_id, checked: !wasChecked, block_done: block.done, total_items: total, completed_count: block.completedItems.length };
    });

    return {
      content: [{
        type: 'text',
        text: `Item ${result.checked ? 'checked' : 'unchecked'}.\n\n${JSON.stringify(result, null, 2)}`,
      }],
    };
  }
);

// ==================== PRIORITY TOOLS ====================

server.tool(
  'add_priority_item',
  'Add an item to the priority circle in a specific zone.',
  {
    name: z.string().describe('Item name (e.g. "Saúde e disposição")'),
    pillar: z.enum(['pessoal', 'profissional', 'relacionamentos', 'qualidade']).describe('Life pillar: pessoal, profissional, relacionamentos, or qualidade'),
    color: z.string().optional().describe('Hex color. Auto-assigned by pillar if omitted.'),
    zone: z.enum(['zone1', 'zone2', 'zone3', 'unallocated']).optional().describe('Target zone (default: unallocated)'),
  },
  async ({ name, pillar, color, zone }) => {
    const pillarColors = { pessoal: '#34c759', profissional: '#ff9500', relacionamentos: '#ff2d55', qualidade: '#5ac8fa' };
    const targetZone = zone || 'unallocated';

    const state = await updateState(s => {
      if (!s.priorities) s.priorities = { zone1: [], zone2: [], zone3: [], unallocated: [] };
      if (!s.priorities[targetZone]) s.priorities[targetZone] = [];

      const newItem = {
        id: uid(),
        name,
        pillar,
        color: color || pillarColors[pillar],
      };

      s.priorities[targetZone].push(newItem);
    });

    const items = state.priorities[targetZone];
    const added = items[items.length - 1];

    return {
      content: [{
        type: 'text',
        text: `Item added to ${targetZone}:\n\n${JSON.stringify(added, null, 2)}`,
      }],
    };
  }
);

server.tool(
  'remove_priority_item',
  'Remove an item from the priority circle entirely.',
  {
    item_id: z.string().describe('Item ID to remove'),
  },
  async ({ item_id }) => {
    await updateState(s => {
      const found = getPriorityItemById(s, item_id);
      if (!found) throw new Error(`Priority item "${item_id}" not found.`);
      const p = s.priorities || {};
      p[found.zone] = (p[found.zone] || []).filter(i => i.id !== item_id);
    });

    return {
      content: [{
        type: 'text',
        text: `Priority item "${item_id}" removed.`,
      }],
    };
  }
);

server.tool(
  'move_priority_item',
  'Move a priority item between zones. Zone1 has a max of 3 items.',
  {
    item_id: z.string().describe('Item ID to move'),
    target_zone: z.enum(['zone1', 'zone2', 'zone3', 'unallocated']).describe('Destination zone'),
  },
  async ({ item_id, target_zone }) => {
    let moved;

    const state = await updateState(s => {
      const p = s.priorities || {};
      const found = getPriorityItemById(s, item_id);
      if (!found) throw new Error(`Priority item "${item_id}" not found.`);
      if (found.zone === target_zone) return;

      if (!p[target_zone]) p[target_zone] = [];

      // Zone1 limit check
      if (target_zone === 'zone1' && p.zone1.length >= 3) {
        throw new Error('Zone1 already has 3 items. Remove one first or use a different zone.');
      }

      p[found.zone] = (p[found.zone] || []).filter(i => i.id !== item_id);
      p[target_zone].push(found.item);
      moved = { item: found.item, from: found.zone, to: target_zone };
    });

    return {
      content: [{
        type: 'text',
        text: `Item moved from ${moved.from} to ${moved.to}:\n\n${JSON.stringify(moved.item, null, 2)}`,
      }],
    };
  }
);

// ==================== LOGS & SETTINGS ====================

server.tool(
  'get_logs',
  'View the recent activity timeline — shows the latest actions performed in the app.',
  {
    limit: z.number().optional().describe('Number of entries to return (default: 20, max: 50)'),
  },
  async ({ limit }) => {
    const state = await getState();
    const logs = (state.logs || []).slice(0, Math.min(limit || 20, 50));
    const formatted = logs.map(formatLog);

    return {
      content: [{
        type: 'text',
        text: formatted.length > 0
          ? JSON.stringify(formatted, null, 2)
          : 'No activity logs found.',
      }],
    };
  }
);

server.tool(
  'get_settings',
  'Get current user settings — notifications, theme, reminder minutes, marquee visibility.',
  {},
  async () => {
    const state = await getState();
    const settings = state.settings || {};

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(settings, null, 2),
      }],
    };
  }
);

server.tool(
  'update_setting',
  'Update a user setting. Only the provided fields are changed.',
  {
    notifications: z.boolean().optional().describe('Enable/disable push notifications'),
    reminder_min: z.number().optional().describe('Minutes before block to send reminder'),
    theme: z.enum(['light', 'dark', 'auto']).optional().describe('Theme preference'),
    show_marquee: z.boolean().optional().describe('Show/hide the motivational marquee phrases'),
    timezone: z.string().optional().describe('Timezone (e.g. "America/Sao_Paulo")'),
    language: z.enum(['pt-BR', 'en-US']).optional().describe('Interface language'),
  },
  async ({ notifications, reminder_min, theme, show_marquee, timezone, language }) => {
    const state = await updateState(s => {
      if (!s.settings) s.settings = {};
      if (notifications !== undefined) s.settings.notifications = notifications;
      if (reminder_min !== undefined) s.settings.reminderMin = reminder_min;
      if (theme !== undefined) s.settings.theme = theme;
      if (show_marquee !== undefined) s.settings.showMarquee = show_marquee;
      if (timezone !== undefined) s.settings.timezone = timezone;
      if (language !== undefined) s.settings.language = language;
    });

    return {
      content: [{
        type: 'text',
        text: `Settings updated:\n\n${JSON.stringify(state.settings, null, 2)}`,
      }],
    };
  }
);

// ==================== BOOT ====================

async function main() {
  try {
    if (refreshToken) {
      const user = await db.loginWithRefreshToken(refreshToken);
      console.error(`[Take Time MCP] Authenticated as ${user.email} (session auto-refreshes)`);
    } else if (email && password) {
      const user = await db.loginWithCredentials(email, password);
      console.error(`[Take Time MCP] Authenticated as ${user.email} (session auto-refreshes)`);
    } else {
      const user = await db.authenticate();
      console.error(`[Take Time MCP] Authenticated as ${user.email} (token mode — will expire)`);
    }
  } catch (e) {
    console.error(`[Take Time MCP] Authentication failed: ${e.message}`);
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[Take Time MCP] Server running on stdio');
}

main().catch(e => {
  console.error('[Take Time MCP] Fatal error:', e.message);
  process.exit(1);
});

