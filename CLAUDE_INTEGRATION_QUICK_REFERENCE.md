# Claude Integration - Quick Reference Guide

## Core Functions

### 1. launchClaude() - The Main Entry Point
**Location:** `src/utils/claude.ts:61-152`

```typescript
// HEADLESS MODE (returns string)
const branchName = await launchClaude(prompt, { 
  headless: true,
  model: 'haiku' 
})

// INTERACTIVE MODE (void, streams to terminal)
await launchClaude(prompt, { 
  headless: false,
  addDir: '/path/to/workspace'
})
```

#### Key Options:
- `headless: boolean` - Enable `-p` flag and capture stdout
- `model?: string` - Set `--model` flag
- `permissionMode?: 'plan' | 'acceptEdits' | 'bypassPermissions'` - Set `--permission-mode`
- `addDir?: string` - Set `--add-dir` (working directory)
- `appendSystemPrompt?: string` - Prepend system instructions
- `agents?: Record<string, unknown>` - Pass `--agents` JSON
- `mcpConfig?: Record<string, unknown>[]` - Pass `--mcp-config` JSON
- `allowedTools?: string[]` - Pass `--allowed-tools`
- `disallowedTools?: string[]` - Pass `--disallowed-tools`

---

## Architecture Layers

### Layer 1: Low-Level (launchClaude in utils/claude.ts)
```
CLI Flag: -p → headless mode (capture stdout)
CLI Flag: --add-dir → working directory
CLI Flag: --model → model selection
↓
execa('claude', args, { input | stdio: 'inherit' })
```

### Layer 2: Service Layer (ClaudeService in lib/ClaudeService.ts)
```
launchForWorkflow(ClaudeWorkflowOptions)
  → Determine model based on workflow type
  → Determine permission mode from settings
  → Load agents and MCP config
  → Call launchClaude()
```

### Layer 3: Context Layer (ClaudeContextManager in lib/ClaudeContextManager.ts)
```
launchWithContext(context)
  → Prepare context (validation)
  → Convert to ClaudeWorkflowOptions
  → Delegate to ClaudeService
```

### Layer 4: Command Layer (IgniteCommand in commands/ignite.ts)
```
execute()
  → Auto-detect context from directory/branch
  → Load prompt templates
  → Load agents and MCP config
  → Call launchClaude() directly
```

---

## Debug/Logging

### How to Enable Debug Output:

**Option 1: Environment Variable**
```bash
ILOOM_DEBUG=true hb start 123
```

**Option 2: CLI Flag**
```bash
hb --debug start 123
```

**Option 3: Programmatically**
```typescript
import { logger } from './utils/logger'
logger.setDebug(true)
```

### Debug Output Format:
```
🔍 Message { data: 'object', key: 'value' }
```

---

## JSON Output

### Currently Supported:
```bash
# List command with JSON output
hb list --json
```

Returns raw JSON without emoji formatting.

### Not Yet Supported:
- JSON output for interactive Claude workflows
- NDJSON streaming of Claude responses
- Structured JSON status updates

---

## How Headless Mode Works

### Input/Output Flow:

```
HEADLESS (headless: true):
┌─────────────────────────────────────┐
│ launchClaude(prompt, {...})         │
│ with headless: true                 │
├─────────────────────────────────────┤
│ → Builds args with -p flag          │
│ → execa('claude', args, {           │
│     input: prompt,  ← stdin input   │
│     timeout: 0                      │
│   })                                │
│ → Captures stdout                   │
│ → Returns result.stdout.trim()      │
└─────────────────────────────────────┘
     ↓
Returns: string (e.g., "feat/issue-165-...")
```

### Use Cases:
1. Branch name generation
2. Structured data extraction
3. One-shot completions
4. Non-interactive workflows

---

## How Interactive Mode Works

### Input/Output Flow:

```
INTERACTIVE (headless: false):
┌──────────────────────────────────────┐
│ launchClaude(prompt, {...})          │
│ with headless: false                 │
├──────────────────────────────────────┤
│ → Builds args without -p flag        │
│ → execa('claude', [...args, '--',    │
│     prompt], {                       │
│     stdio: 'inherit', ← streaming    │
│     timeout: 0                       │
│   })                                 │
│ → Claude UI appears in terminal      │
│ → User interacts directly            │
│ → Returns void                       │
└──────────────────────────────────────┘
     ↓
All output streams to current terminal
User interaction is direct
```

### Use Cases:
1. Issue implementation workflows
2. PR review workflows
3. Interactive conflict resolution
4. Real-time user feedback

---

## Workflow Type Detection

### In IgniteCommand.detectWorkspaceContext():

```
Current Directory
    ↓
Check: matches /_pr_(\d+)$/ → PR Workflow
    ↓ (no match)
Check: matches /issue-(\d+)/ → Issue Workflow
    ↓ (no match)
Get git branch name
Check: matches /issue-(\d+)/ in branch → Issue Workflow
    ↓ (no match)
Default → Regular Workflow
```

### Context Detection Examples:
| Directory | Branch | Detected |
|-----------|--------|----------|
| `issue-165-start` | any | Issue #165 |
| `my-work_pr_42` | any | PR #42 |
| `feature` | `feat/issue-165-xyz` | Issue #165 |
| `main` | `main` | Regular |

---

## Model Selection by Workflow Type

```typescript
Issue Workflow:   → claude-sonnet-4-20250514
PR Workflow:      → default (no override)
Regular Workflow: → default (no override)
```

**Can be overridden in settings:**
```json
{
  "agents": {
    "agent-name": {
      "model": "opus"  // Override specific agent
    }
  }
}
```

---

## MCP Configuration (GitHub Comment Broker)

### Generated for Issue/PR Workflows:

```javascript
{
  mcpServers: {
    github_comment: {
      transport: 'stdio',
      command: 'node',
      args: ['/path/to/github-comment-server.js'],
      env: {
        REPO_OWNER: 'owner',
        REPO_NAME: 'name',
        GITHUB_EVENT_NAME: 'issues' | 'pull_request',
        GITHUB_API_URL: 'https://api.github.com/'
      }
    }
  }
}
```

### Tool Filtering:
```typescript
allowedTools: [
  'mcp__github_comment__create_comment',
  'mcp__github_comment__update_comment',
]
disallowedTools: ['Bash(gh api:*)']
```

---

## One-Shot Automation Modes

### Available Modes:
```typescript
type OneShotMode = 'default' | 'noReview' | 'bypassPermissions'
```

### Usage:
```bash
hb ignite --one-shot=noReview
hb ignite --one-shot=bypassPermissions
```

### Behavior:
- `default` - Standard workflow, await confirmations
- `noReview` - Skip approval steps, proceed automatically
- `bypassPermissions` - Allow all tool calls without confirmation

---

## Terminal Window Integration (macOS)

### Opening New Terminals:

```typescript
await openTerminalWindow({
  workspacePath: '/path/to/workspace',
  command: 'hb ignite',
  backgroundColor: { r: 100, g: 150, b: 200 },
  includeEnvSetup: true,  // source .env
  includePortExport: true, // export PORT=3000
  port: 3000
})
```

### Generated AppleScript:
```applescript
tell application "Terminal"
  set newTab to do script "cd '/path' && source .env && export PORT=3000 && hb ignite"
  set background color of newTab to {R, G, B}  // 16-bit RGB
end tell
```

**Note:** macOS only (Terminal.app). Linux/Windows not yet supported.

---

## Agent System

### Agent Definition (Markdown + Frontmatter):

```yaml
---
name: agent-name
description: What this agent does
model: sonnet              # sonnet | opus | haiku
tools: tool1, tool2, tool3 # Comma-separated
color: blue                # Optional terminal color
---

[Markdown prompt for the agent...]
```

### Loading Agents:

```typescript
const agentManager = new AgentManager()
const agents = await agentManager.loadAgents(settings)
const formattedForCli = agentManager.formatForCli(agents)

// Pass to launchClaude:
await launchClaude(prompt, { agents: formattedForCli })
```

---

## Settings Structure

**Location:** `~/.hatchbox/settings.json`

```json
{
  "workflows": {
    "issue": {
      "permissionMode": "acceptEdits",
      "startClaude": true,
      "startCode": true,
      "startDevServer": false,
      "startTerminal": false
    },
    "pr": {
      "permissionMode": "default"
    },
    "regular": {
      "permissionMode": "default"
    }
  },
  "agents": {
    "agent-name": {
      "model": "opus"  // Override default model
    }
  }
}
```

---

## Error Handling Patterns

### launchClaude() throws on:
```typescript
// Missing Claude CLI
- "Claude CLI error: command not found"

// Invalid workspace
- "Claude CLI error: [stderr output]"

// Execution failure
- "Claude CLI error: [error message]"
```

### Service layer handles:
```typescript
try {
  await claudeService.launchForWorkflow(options)
} catch (error) {
  logger.error('Failed to launch Claude', { error, options })
  throw error  // Re-throw after logging
}
```

---

## Testing Patterns

### Mocking Claude:
```typescript
vi.mock('execa')

const mockResult = {
  stdout: 'feat/issue-123-branch-name',
  exitCode: 0
}
vi.mocked(execa).mockResolvedValueOnce(mockResult)

const result = await launchClaude(prompt, { headless: true })
expect(result).toBe('feat/issue-123-branch-name')
```

### Testing Headless:
```typescript
// Verify -p flag is passed
expect(execa).toHaveBeenCalledWith(
  'claude',
  ['-p', ...otherArgs],
  expect.any(Object)
)

// Verify stdout is captured
expect(execa).toHaveBeenCalledWith(
  expect.any(String),
  expect.any(Array),
  expect.objectContaining({ input: prompt })
)
```

### Testing Interactive:
```typescript
// Verify -p flag is NOT passed
expect(execa).toHaveBeenCalledWith(
  'claude',
  expect.arrayContaining(['--', prompt]),
  expect.any(Object)
)

// Verify stdio inheritance
expect(execa).toHaveBeenCalledWith(
  expect.any(String),
  expect.any(Array),
  expect.objectContaining({ stdio: 'inherit' })
)
```

---

## Common Debug Scenarios

### Debug branch name generation:
```bash
ILOOM_DEBUG=true hb start 123
# Look for: "Sending prompt to Claude { prompt: '...' }"
# Look for: "Claude returned branch name { branchName: '...' }"
```

### Debug context detection:
```bash
cd /path/to/workspace
ILOOM_DEBUG=true hb ignite
# Look for: "Auto-detected issue #165 from directory"
# Look for: "Auto-detected [type] workflow"
```

### Debug settings loading:
```bash
hb --debug start 123
# Look for: "Loaded project settings { agentOverrides: [...] }"
```

### Debug Claude launch:
```bash
hb --debug ignite
# Look for: "Launching Claude in current terminal { type: 'issue', ... }"
```

