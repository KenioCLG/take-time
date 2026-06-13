#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { SupabaseClient, loadPersistedRefreshToken } from './supabase.js';
import {
  uid, getCurrentWeekDates,
  validateDate, validateTime, validateColor,
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

// --- MCP Server ---
import { readFileSync } from 'fs';
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const instructions = readFileSync(new URL('../INSTRUCTIONS.md', import.meta.url), 'utf8');

const server = new McpServer({
  name: 'taketime',
  version: pkg.version,
}, {
  instructions,
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
    let filters = {};
    if (done !== undefined) filters.done = done;
    
    if (date_from && date_to) {
      // using custom query param for ranges would require more complex logic
      // for now, fetch all and filter in memory if it's a range, or we can use Supabase gte/lte if we update the helper
    } else {
      filters.date = date || new Date().toISOString().split('T')[0];
    }

    let blocks = await db.query('blocks', filters) || [];

    if (date_from && date_to) {
      blocks = blocks.filter(b => b.date >= date_from && b.date <= date_to);
    }

    if (subject_name) {
      const subjects = await db.query('subjects', { name: subject_name }) || [];
      const subject = subjects[0];
      if (subject) blocks = blocks.filter(b => b.subject_id === subject.id);
    }

    blocks.sort((a, b) => a.start_time.localeCompare(b.start_time));

    return {
      content: [{
        type: 'text',
        text: blocks.length > 0
          ? JSON.stringify(blocks, null, 2)
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
    const filters = {};
    if (type) filters.type = type;
    
    let subjects = await db.query('subjects', filters) || [];

    if (include_items !== false) {
      // Fetch all items for these subjects and attach them
      const subjectIds = subjects.map(s => s.id);
      if (subjectIds.length > 0) {
        // As a simplification, we fetch all items for the user and group them
        const allItems = await db.query('subject_items') || [];
        subjects = subjects.map(s => {
          const items = allItems.filter(i => i.subject_id === s.id);
          return { ...s, items };
        });
      }
    }

    return {
      content: [{
        type: 'text',
        text: subjects.length > 0
          ? JSON.stringify(subjects, null, 2)
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
    let blocks = await db.query('blocks') || [];
    const subjects = await db.query('subjects') || [];
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const p = period || 'week';

    if (p === 'today') {
      blocks = blocks.filter(b => b.date === today);
    } else if (p === 'week') {
      const { start, end } = getCurrentWeekDates();
      blocks = blocks.filter(b => b.date >= start && b.date <= end);
    } else if (p === 'month') {
      const monthStart = today.slice(0, 7) + '-01';
      blocks = blocks.filter(b => b.date >= monthStart && b.date <= today);
    }

    const total = blocks.length;
    const completed = blocks.filter(b => b.done).length;
    const rate = total > 0 ? Math.round((completed / total) * 100) / 100 : 0;

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
    const dateSet = new Set(blocks.filter(b => b.done).map(b => b.date));
    const checkDate = new Date(now);
    while (dateSet.has(checkDate.toISOString().split('T')[0])) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }

    // Top subjects
    const subjectMap = {};
    blocks.forEach(b => {
      const subject = subjects.find(s => s.id === b.subject_id);
      const name = subject?.name || 'Unknown';
      if (!subjectMap[name]) subjectMap[name] = { name, blocks: 0, minutes: 0 };
      subjectMap[name].blocks++;
      if (b.start_time && b.end_time) {
        const [sh, sm] = b.start_time.split(':').map(Number);
        const [eh, em] = b.end_time.split(':').map(Number);
        subjectMap[name].minutes += (eh * 60 + em) - (sh * 60 + sm);
      }
    });
    const topSubjects = Object.values(subjectMap).sort((a, b) => b.blocks - a.blocks).slice(0, 5);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          total_blocks: total,
          completed_blocks: completed,
          completion_rate: rate,
          streak_days: streak,
          total_minutes: totalMinutes,
          top_subjects: topSubjects,
        }, null, 2),
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
    const { start, end, dates } = getCurrentWeekDates(week_offset || 0);
    const allBlocks = await db.query('blocks') || [];
    const subjects = await db.query('subjects') || [];
    const blocks = allBlocks.filter(b => b.date >= start && b.date <= end);

    const days = {};
    dates.forEach(d => { days[d] = []; });
    blocks.forEach(b => {
      if (days[b.date]) {
        const subject = subjects.find(s => s.id === b.subject_id);
        days[b.date].push({
          id: b.id,
          subject_id: b.subject_id,
          subject_name: subject?.name || 'Unknown',
          date: b.date,
          start: b.start_time?.substring(0, 5),
          end: b.end_time?.substring(0, 5),
          topic: b.topic || null,
          done: !!b.done,
          completed_items: b.completed_items || [],
          repeat_daily: !!b.repeat_daily,
        });
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
    const allBlocks = await db.query('blocks') || [];
    const numDays = Math.min(days || 90, 365);
    const now = new Date();
    const heatmap = {};

    // Build daily counts from all blocks
    allBlocks.forEach(b => {
      if (!b.date) return;
      let count = b.done ? 1 : 0;
      count += (b.completed_items || []).length;
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
    const allPriorities = await db.query('priorities') || [];

    const grouped = {
      zone1_main_focus: allPriorities.filter(p => p.zone === 'zone1'),
      zone2_important: allPriorities.filter(p => p.zone === 'zone2'),
      zone3_flexible: allPriorities.filter(p => p.zone === 'zone3'),
      unallocated: allPriorities.filter(p => p.zone === 'unallocated'),
    };

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(grouped, null, 2),
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

    if (start >= end) throw new Error('Start time must be before end time.');

    // 1. Get Subject
    const subjects = await db.query('subjects', { name: subject_name });
    if (!subjects || subjects.length === 0) {
      throw new Error(`Subject "${subject_name}" not found. Use list_subjects to see available activities.`);
    }
    const subject = subjects[0];

    // 2. Check conflicts
    const existing = await db.query('blocks', { date }) || [];
    const conflict = existing.find(b => {
      // time comparisons work directly with 'HH:MM:SS' strings
      const bStart = b.start_time.substring(0, 5);
      const bEnd = b.end_time.substring(0, 5);
      return bStart < end && bEnd > start;
    });

    if (conflict) {
      const conflictSubject = await db.query('subjects', { id: conflict.subject_id });
      const conflictName = conflictSubject?.[0]?.name || 'Unknown';
      throw new Error(`Time conflict with "${conflictName}" block (${conflict.start_time.substring(0,5)}-${conflict.end_time.substring(0,5)}).`);
    }

    // 3. Insert Block
    const blockData = {
      subject_id: subject.id,
      date,
      start_time: start,
      end_time: end,
      topic: topic || '',
      done: false,
      completed_items: '{}', // Format for empty text array in PostgREST
    };

    const res = await db.insert('blocks', blockData);
    const newBlock = res?.[0] || blockData;

    return {
      content: [{
        type: 'text',
        text: `Block created: ${subject_name} on ${date} from ${start} to ${end}${topic ? ` — ${topic}` : ''}\n\n${JSON.stringify(newBlock, null, 2)}`,
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
    repeat_daily: z.boolean().optional().describe('Toggle daily auto-repeat'),
  },
  async ({ block_id, start, end, topic, done, repeat_daily }) => {
    if (start !== undefined) validateTime(start);
    if (end !== undefined) validateTime(end);

    // Fetch existing
    const existing = await db.query('blocks', { id: block_id });
    if (!existing || existing.length === 0) throw new Error(`Block "${block_id}" not found.`);

    const updates = {};
    if (start !== undefined) updates.start_time = start;
    if (end !== undefined) updates.end_time = end;
    if (topic !== undefined) updates.topic = topic;
    if (done !== undefined) updates.done = done;
    if (repeat_daily !== undefined) updates.repeat_daily = repeat_daily;

    const res = await db.update('blocks', block_id, updates);
    const updatedBlock = res?.[0] || updates;

    return {
      content: [{
        type: 'text',
        text: `Block updated successfully.\n\n${JSON.stringify(updatedBlock, null, 2)}`,
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
    const existing = await db.query('blocks', { id: block_id });
    if (!existing || existing.length === 0) throw new Error(`Block "${block_id}" not found.`);

    await db.remove('blocks', block_id);

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
    slots: z.number().optional().describe('Number of preferred slots (default: 0)'),
  },
  async ({ name, type, color, slots }) => {
    if (color) validateColor(color);
    const colors = ['#007aff', '#34c759', '#ff9500', '#ff3b30', '#af52de', '#5ac8fa', '#ffcc00', '#5856d6'];

    // Fetch existing
    const existing = await db.query('subjects', { name });
    if (existing && existing.length > 0) throw new Error(`Activity "${name}" already exists.`);

    // How many subjects exist for color picking
    const allSubjects = await db.query('subjects', {}) || [];

    const subjectData = {
      name: name.slice(0, 40),
      type,
      color: color || colors[allSubjects.length % colors.length],
      slots: slots || 0,
      sort_order: allSubjects.length,
    };

    const res = await db.insert('subjects', subjectData);
    const newSubject = res?.[0] || subjectData;

    return {
      content: [{
        type: 'text',
        text: `Activity created: "${name}" (${type})\n\n${JSON.stringify(newSubject, null, 2)}`,
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
    topic: z.string().optional().describe('Item name — syllabus topic (study), exercise name (training), or habit (routine)'),
    name: z.string().optional().describe('Alias for topic — exercise name (for training subjects)'),
    sets: z.number().optional().describe('Number of sets (for training subjects)'),
    reps: z.number().optional().describe('Repetitions per set (for training subjects)'),
    weight: z.string().optional().describe('Weight used (for training subjects)'),
    task: z.string().optional().describe('Alias for topic — micro-habit description (for routine subjects)'),
  },
  async ({ subject_name, topic, name, sets, reps, weight, task }) => {
    const existing = await db.query('subjects', { name: subject_name });
    if (!existing || existing.length === 0) throw new Error(`Subject "${subject_name}" not found.`);
    const subject = existing[0];

    // Determine the primary text for the item (name)
    let itemName = '';
    if (subject.type === 'study') {
      if (!topic) throw new Error('"topic" is required for study subjects.');
      itemName = topic;
    } else if (subject.type === 'training') {
      if (!name) throw new Error('"name" is required for training subjects.');
      itemName = name;
    } else {
      if (!task) throw new Error('"task" is required for routine subjects.');
      itemName = task;
    }

    const itemData = {
      subject_id: subject.id,
      name: itemName,
      sets: sets || null,
      reps: reps ? String(reps) : null,
      weight: weight || null,
      done: false,
      sort_order: 0,
    };

    const res = await db.insert('subject_items', itemData);
    const item = res?.[0] || itemData;

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
    // Delete directly by item ID
    const existing = await db.query('subject_items', { id: item_id });
    if (!existing || existing.length === 0) throw new Error(`Item "${item_id}" not found.`);

    await db.remove('subject_items', item_id);

    return {
      content: [{
        type: 'text',
        text: `Item ${item_id} removed from "${subject_name}".`,
      }],
    };
  }
);

server.tool(
  'update_subject_item',
  'Update a content item — change name, exercise parameters, or completion status.',
  {
    subject_name: z.string().describe('Name of the activity/subject'),
    item_id: z.string().describe('ID of the item to update'),
    topic: z.string().optional().describe('New item name (syllabus topic, exercise name, or habit)'),
    name: z.string().optional().describe('Alias for topic — new exercise name'),
    task: z.string().optional().describe('Alias for topic — new micro-habit task'),
    status: z.enum(['pending', 'completed']).optional().describe('Mark as pending or completed'),
    sets: z.number().optional().describe('New sets count'),
    reps: z.number().optional().describe('New reps count'),
    weight: z.string().optional().describe('New weight'),
  },
  async ({ subject_name, item_id, topic, name, task, status, sets, reps, weight }) => {
    const existingItem = await db.query('subject_items', { id: item_id });
    if (!existingItem || existingItem.length === 0) throw new Error(`Item "${item_id}" not found.`);

    const updates = {};
    const newName = topic || name || task;
    if (newName !== undefined) updates.name = newName;
    if (status !== undefined) updates.done = status === 'completed';
    if (sets !== undefined) updates.sets = sets;
    if (reps !== undefined) updates.reps = String(reps);
    if (weight !== undefined) updates.weight = weight;

    const res = await db.update('subject_items', item_id, updates);
    const updated = res?.[0] || updates;

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
    slots: z.number().optional().describe('New number of preferred slots'),
  },
  async ({ subject_name, new_name, color, slots }) => {
    if (color !== undefined) validateColor(color);

    const existing = await db.query('subjects', { name: subject_name });
    if (!existing || existing.length === 0) throw new Error(`Subject "${subject_name}" not found.`);
    const subject = existing[0];

    const updates = {};
    if (new_name !== undefined) updates.name = new_name.slice(0, 40);
    if (color !== undefined) updates.color = color;
    if (slots !== undefined) updates.slots = slots;

    const res = await db.update('subjects', subject.id, updates);
    const updatedSubject = res?.[0] || updates;

    return {
      content: [{
        type: 'text',
        text: `Subject updated:\n\n${JSON.stringify(updatedSubject, null, 2)}`,
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
    const existing = await db.query('subjects', { name: subject_name });
    if (!existing || existing.length === 0) throw new Error(`Subject "${subject_name}" not found.`);
    const subject = existing[0];

    // Delete matching priorities (no FK constraint, matched by name)
    const priorities = await db.query('priorities', {});
    if (priorities && priorities.length > 0) {
      const nameLower = subject.name.toLowerCase();
      const prioritiesToDelete = priorities.filter(p => p.name.toLowerCase() === nameLower);
      for (const p of prioritiesToDelete) {
        await db.remove('priorities', p.id);
      }
    }

    await db.remove('subjects', subject.id);

    return {
      content: [{
        type: 'text',
        text: `Subject "${subject_name}" deleted successfully. Associated blocks and priorities were also removed via cascade.`,
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
    const existingBlock = await db.query('blocks', { id: block_id });
    if (!existingBlock || existingBlock.length === 0) throw new Error(`Block "${block_id}" not found.`);
    const block = existingBlock[0];

    const subjectItems = await db.query('subject_items', { subject_id: block.subject_id }) || [];
    const total = subjectItems.length;
    let completedItems = block.completed_items || [];
    const wasChecked = completedItems.includes(item_id);

    if (wasChecked) {
      completedItems = completedItems.filter(id => id !== item_id);
    } else {
      completedItems.push(item_id);
    }

    let isDone = block.done;
    // Auto-complete block if all items are done
    if (total > 0 && completedItems.length === total) {
      isDone = true;
    } else if (wasChecked) {
      isDone = false;
    }

    await db.update('blocks', block_id, {
      completed_items: completedItems,
      done: isDone
    });

    const result = {
      block_id: block.id,
      item_id,
      checked: !wasChecked,
      block_done: isDone,
      total_items: total,
      completed_count: completedItems.length
    };

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
  'Add an item to the priority circle in a specific zone. Zone1 (Main Focus) has a max of 3 items.',
  {
    name: z.string().describe('Item name (e.g. "Health & Energy", "Finances")'),
    zone: z.enum(['zone1', 'zone2', 'zone3', 'unallocated']).optional().describe('Target zone (default: unallocated). zone1=Main Focus, zone2=Important, zone3=Flexible'),
  },
  async ({ name, zone }) => {
    const targetZone = zone || 'unallocated';

    const existing = await db.query('priorities', { zone: targetZone }) || [];

    if (targetZone === 'zone1' && existing.length >= 3) {
      throw new Error('Zone1 (Main Focus) already has 3 items. Remove one first or use a different zone.');
    }

    const priorityData = {
      name,
      zone: targetZone,
      sort_order: existing.length,
    };

    const res = await db.insert('priorities', priorityData);
    const added = res?.[0] || priorityData;

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
    const existing = await db.query('priorities', { id: item_id });
    if (!existing || existing.length === 0) throw new Error(`Priority item "${item_id}" not found.`);

    await db.remove('priorities', item_id);

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
    const existingItem = await db.query('priorities', { id: item_id });
    if (!existingItem || existingItem.length === 0) throw new Error(`Priority item "${item_id}" not found.`);
    const item = existingItem[0];

    if (item.zone === target_zone) {
      return {
        content: [{ type: 'text', text: `Item is already in ${target_zone}.` }],
      };
    }

    // Zone1 limit check
    if (target_zone === 'zone1') {
      const zone1Items = await db.query('priorities', { zone: 'zone1' }) || [];
      if (zone1Items.length >= 3) {
        throw new Error('Zone1 already has 3 items. Remove one first or use a different zone.');
      }
    }

    const res = await db.update('priorities', item_id, { zone: target_zone });
    const moved = res?.[0] || item;

    return {
      content: [{
        type: 'text',
        text: `Item moved from ${item.zone} to ${target_zone}:\n\n${JSON.stringify(moved, null, 2)}`,
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
    const limitNum = Math.min(limit || 20, 50);
    const logs = await db.query('logs', {}) || [];
    
    const sorted = logs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limitNum);
    const formatted = sorted.map(log => ({ timestamp: log.created_at, action: log.action, detail: log.detail }));

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
    const profiles = await db.query('profiles', {}) || [];
    const settings = profiles.length > 0 ? profiles[0] : {};

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
    const profiles = await db.query('profiles', {});
    if (!profiles || profiles.length === 0) throw new Error('User profile not found.');
    const profile = profiles[0];

    const updates = {};
    if (notifications !== undefined) updates.notifications = notifications;
    if (reminder_min !== undefined) updates.reminder_min = reminder_min;
    if (theme !== undefined) updates.theme = theme;
    if (show_marquee !== undefined) updates.show_marquee = show_marquee;
    if (timezone !== undefined) updates.timezone = timezone;
    if (language !== undefined) updates.language = language;

    // Use db.userId for the profile ID since it matches auth.users(id)
    const res = await db.update('profiles', db.userId, updates);
    const updated = res?.[0] || updates;

    return {
      content: [{
        type: 'text',
        text: `Settings updated:\n\n${JSON.stringify(updated, null, 2)}`,
      }],
    };
  }
);

// ==================== BOOT ====================

async function main() {
  try {
    if (refreshToken) {
      try {
        const user = await db.loginWithRefreshToken(refreshToken);
        console.error(`[Take Time MCP] Authenticated as ${user.email} (session auto-refreshes)`);
      } catch (e) {
        // Token from env may be already used — try persisted token
        const persisted = loadPersistedRefreshToken();
        if (persisted && persisted !== refreshToken) {
          console.error('[Take Time MCP] Env token expired, trying persisted token...');
          const user = await db.loginWithRefreshToken(persisted);
          console.error(`[Take Time MCP] Authenticated as ${user.email} (using persisted token)`);
        } else {
          throw e;
        }
      }
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

  // Write mcp_last_seen so the app can verify the server is actually running
  try {
    console.error('[Take Time MCP] Ready to process requests.');
  } catch (e) {
    console.error('[Take Time MCP] Could not update status:', e.message);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[Take Time MCP] Server running on stdio');
}

main().catch(e => {
  console.error('[Take Time MCP] Fatal error:', e.message);
  process.exit(1);
});

