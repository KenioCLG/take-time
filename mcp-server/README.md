<p align="center">
  <img src="../icons/logo-mark.svg" width="64" height="64" alt="Take Time">
</p>

<h1 align="center">Take Time MCP Server</h1>

<p align="center">
  <strong>Manage your study schedule with AI — through Claude, ChatGPT, Cursor, and more.</strong>
</p>

<p align="center">
  <a href="https://docs.taketime.space/mcp/overview">Docs</a> &bull;
  <a href="https://taketime.space">App</a> &bull;
  <a href="https://github.com/KenioCLG/take-time">GitHub</a>
</p>

---

## What is this?

The **Take Time MCP Server** lets AI assistants manage your study blocks, activities, and schedule through the [Model Context Protocol](https://modelcontextprotocol.io).

Talk to your AI naturally:

- *"What do I have scheduled for today?"*
- *"Create a JavaScript block tomorrow at 9am"*
- *"Mark my morning study block as done"*
- *"How was my study week?"*
- *"Add a new micro-habit to my morning routine"*
- *"What's in my priority circle?"*
- *"Move 'Saúde' to zone 1"*
- *"Check off today's meditation in my morning block"*

## Quick Setup

### 1. Configure your AI client

No installation needed — just add the config to your AI client:

<details>
<summary><strong>Claude Code</strong></summary>

Edit `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "taketime": {
      "command": "npx",
      "args": ["-y", "@taketimemcp/mcp-server"],
      "env": {
        "TAKETIME_EMAIL": "your@email.com",
        "TAKETIME_PASSWORD": "your-password"
      }
    }
  }
}
```

</details>

<details>
<summary><strong>Claude Desktop</strong></summary>

Edit `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "taketime": {
      "command": "npx",
      "args": ["-y", "@taketimemcp/mcp-server"],
      "env": {
        "TAKETIME_EMAIL": "your@email.com",
        "TAKETIME_PASSWORD": "your-password"
      }
    }
  }
}
```

</details>

<details>
<summary><strong>Cursor</strong></summary>

Edit `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "taketime": {
      "command": "npx",
      "args": ["-y", "@taketimemcp/mcp-server"],
      "env": {
        "TAKETIME_EMAIL": "your@email.com",
        "TAKETIME_PASSWORD": "your-password"
      }
    }
  }
}
```

</details>

<details>
<summary><strong>VS Code (Copilot)</strong></summary>

Edit `.vscode/mcp.json`:

```json
{
  "servers": {
    "taketime": {
      "command": "npx",
      "args": ["-y", "@taketimemcp/mcp-server"],
      "env": {
        "TAKETIME_EMAIL": "your@email.com",
        "TAKETIME_PASSWORD": "your-password"
      }
    }
  }
}
```

</details>

<details>
<summary><strong>Windsurf</strong></summary>

Edit `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "taketime": {
      "command": "npx",
      "args": ["-y", "@taketimemcp/mcp-server"],
      "env": {
        "TAKETIME_EMAIL": "your@email.com",
        "TAKETIME_PASSWORD": "your-password"
      }
    }
  }
}
```

</details>

### 2. Restart your AI client

The Take Time tools should now appear. Try: *"List my study subjects"*

## Authentication

Three methods supported:

| Method | Env Vars | Auto-refresh | Recommended |
|--------|----------|-------------|-------------|
| **Refresh Token** | `TAKETIME_REFRESH_TOKEN` | Yes | ✅ **Best** |
| **Email/Password** | `TAKETIME_EMAIL` + `TAKETIME_PASSWORD` | Yes | Good |
| **Access Token** | `TAKETIME_API_KEY` | No (expires ~1h) | For testing |

**Refresh Token** is the best option — copy it from the app's MCP settings panel. It auto-refreshes indefinitely without exposing your password.

## Available Tools — 21 tools

### Schedule (blocks)

| Tool | Description |
|------|-------------|
| `list_blocks` | List study blocks by date, range, subject, or status |
| `get_schedule` | Full weekly schedule organized by day |
| `create_block` | Schedule a new study block |
| `update_block` | Change time, topic, syllabus topic, repeat daily, mark as done |
| `delete_block` | Remove a study block |

### Activities (subjects)

| Tool | Description |
|------|-------------|
| `list_subjects` | List all activities with profiles, content items, and counts |
| `create_subject` | Create a new activity (study, training, or routine) |
| `update_subject` | Rename, change color, reorder slots |
| `add_subject_item` | Add syllabus topic, exercise, or micro-habit |
| `update_subject_item` | Update item details (topic, duration, sets, etc.) |
| `remove_subject_item` | Remove an item from a subject |

### Atomic Habits

| Tool | Description |
|------|-------------|
| `toggle_block_item` | **Mark/unmark** a habit or exercise as done in a block — auto-completes block when all items done |

### Statistics & Reports

| Tool | Description |
|------|-------------|
| `get_stats` | Completion stats, streaks, heatmap, top subjects |
| `get_heatmap` | 90-day consistency heatmap with intensity levels |

### Priority Circle

| Tool | Description |
|------|-------------|
| `get_priorities` | View all priority zones (main focus, important, flexible, unallocated) |
| `add_priority_item` | Add an item to a priority zone with pillar and color |
| `remove_priority_item` | Remove an item from the circle |
| `move_priority_item` | Move an item between zones (zone1 max 3) |

### Logs & Settings

| Tool | Description |
|------|-------------|
| `get_logs` | View recent activity timeline |
| `get_settings` | View user settings (notifications, theme, etc.) |
| `update_setting` | Update a setting value |

## Architecture

```
AI Client (Claude, Cursor, etc.)
     │ stdio
     ▼
Take Time MCP Server (local)
     │ HTTPS
     ▼
Supabase (user_data)
```

- Runs locally on your machine
- Communicates via stdio (JSON-RPC)
- Reads/writes your Take Time data directly on Supabase
- Your data never passes through third-party servers

## Development

```bash
# Run with email/password auth
TAKETIME_EMAIL=you@email.com TAKETIME_PASSWORD=pass node src/index.js

# Run with access token (for testing)
TAKETIME_API_KEY=your_token node src/index.js
```

## License

MIT
