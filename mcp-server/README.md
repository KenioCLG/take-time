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

## Quick Setup

### 1. Clone & install

```bash
git clone https://github.com/KenioCLG/take-time.git
cd take-time/mcp-server
npm install
```

### 2. Configure your AI client

<details>
<summary><strong>Claude Code</strong></summary>

Edit `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "taketime": {
      "command": "node",
      "args": ["/absolute/path/to/take-time/mcp-server/src/index.js"],
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
      "command": "node",
      "args": ["C:/path/to/take-time/mcp-server/src/index.js"],
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
      "command": "node",
      "args": ["/path/to/take-time/mcp-server/src/index.js"],
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
      "command": "node",
      "args": ["/path/to/take-time/mcp-server/src/index.js"],
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
      "command": "node",
      "args": ["/path/to/take-time/mcp-server/src/index.js"],
      "env": {
        "TAKETIME_EMAIL": "your@email.com",
        "TAKETIME_PASSWORD": "your-password"
      }
    }
  }
}
```

</details>

### 3. Restart your AI client

The Take Time tools should now appear. Try: *"List my study subjects"*

## Authentication

Two methods supported:

| Method | Env Vars | Auto-refresh | Recommended |
|--------|----------|-------------|-------------|
| **Email/Password** | `TAKETIME_EMAIL` + `TAKETIME_PASSWORD` | Yes | **Yes** |
| **Access Token** | `TAKETIME_API_KEY` | No (expires ~1h) | For testing |

**Email/Password** is strongly recommended — it automatically refreshes the session so the server runs indefinitely.

## Available Tools

### Read

| Tool | Description |
|------|-------------|
| `list_blocks` | List study blocks by date, range, subject, or status |
| `list_subjects` | List all activities with profiles and content |
| `get_stats` | Completion stats, streaks, heatmap, top subjects |
| `get_schedule` | Full weekly schedule organized by day |

### Write

| Tool | Description |
|------|-------------|
| `create_block` | Schedule a new study block |
| `update_block` | Change time, topic, or mark as done |
| `delete_block` | Remove a study block |
| `create_subject` | Create a new activity/subject |

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
