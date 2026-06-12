#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { SupabaseClient } from './supabase.js';
import {
  uid, getBlocksForDate, getBlocksInRange, getSubjectById, getSubjectByName,
  getCurrentWeekDates, computeStats, formatBlock, formatSubject,
  validateDate, validateTime
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
  'List all activities (study, training, routine) with their profiles, slots, and content.',
  {
    type: z.enum(['study', 'training', 'inactive']).optional().describe('Filter by type'),
  },
  async ({ type }) => {
    const state = await getState();
    let subjects = state.subjects || [];

    if (type) subjects = subjects.filter(s => s.type === type);

    const formatted = subjects.map(formatSubject);

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
  'Update an existing block. Use to mark as done, change time, etc.',
  {
    block_id: z.string().describe('Block ID to update'),
    start: z.string().optional().describe('New start time (HH:MM)'),
    end: z.string().optional().describe('New end time (HH:MM)'),
    topic: z.string().optional().describe('New topic'),
    done: z.boolean().optional().describe('Mark as done or undone'),
  },
  async ({ block_id, start, end, topic, done }) => {
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
  },
  async ({ name, type, color }) => {
    const colors = ['#007aff', '#34c759', '#ff9500', '#ff3b30', '#af52de', '#5ac8fa', '#ffcc00', '#5856d6'];

    const state = await updateState(s => {
      const existing = getSubjectByName(s, name);
      if (existing) throw new Error(`Activity "${name}" already exists.`);

      const subject = {
        id: uid(),
        name: name.slice(0, 40),
        type,
        color: color || colors[s.subjects.length % colors.length],
        slots: [],
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

