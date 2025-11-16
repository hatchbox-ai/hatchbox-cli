# Claude CLI Integration in iloom - Comprehensive Architecture Report

## Executive Summary

The iloom CLI tool integrates Claude through a layered architecture consisting of:
1. **Low-level Claude execution** via `launchClaude()` utility function
2. **Service layer** providing workflow-specific logic via `ClaudeService` class
3. **Context management** via `ClaudeContextManager` for auto-detecting workspace context
4. **Command integration** through the `ignite` command that bridges workspace detection and Claude launching

Key architectural patterns:
- **Headless mode** uses `-p` flag to Claude CLI for capturing stdout
- **Interactive mode** uses `stdio: 'inherit'` to stream all output to current terminal
- **Debug logging** controlled by `ILOOM_DEBUG` env var and `--debug` flag
- **JSON output** available for list command via `--json` flag (outputs raw data with no emoji formatting)

---

## 1. How Claude CLI is Currently Invoked

### Primary Entry Point: `launchClaude()` Function
**File:** `/Users/adam/Documents/Projects/iloom-cli/fix-issue-165-empty-repo-start/src/utils/claude.ts`

```typescript
export async function launchClaude(
  prompt: string,
  options: ClaudeCliOptions = {}
): Promise<string | void>
```

#### Mode of Operation:

**Headless Mode** (for machine-readable output):
```bash
claude -p [--model MODEL] [--permission-mode MODE] --add-dir DIR -- PROMPT
```
- Uses `-p` flag (headless pipe mode)
- Input passed via stdin
- Returns captured stdout
- Used for branch name generation, non-interactive workflows

**Interactive Mode** (for user interaction):
```bash
claude [--model MODEL] [--permission-mode MODE] --add-dir DIR -- PROMPT
```
- No `-p` flag
- Uses `stdio: 'inherit'` for direct terminal streaming
- No return value (void)
- Used for conflict resolution, error fixing, main workflow

### Claude CLI Argument Construction

The function builds arguments dynamically:

1. **Core flags:**
   - `-p` - Headless mode (if enabled)
   - `--model` - Model selection (e.g., "claude-sonnet-4-20250514")
   - `--permission-mode` - Permission control ("acceptEdits", "bypassPermissions", "default")
   - `--add-dir` - Working directory
   - `--` - Argument separator before prompt

2. **Advanced flags:**
   - `--append-system-prompt` - Prepend system instructions
   - `--mcp-config` - MCP server configurations (JSON)
   - `--allowed-tools` - Whitelist specific tools
   - `--disallowed-tools` - Blacklist specific tools
   - `--agents` - Custom agent definitions (JSON)

### Execution Method

Uses the `execa` library:
```typescript
// Headless execution
await execa('claude', args, {
  input: prompt,
  timeout: 0,  // Disabled timeout
  verbose: logger.isDebugEnabled()  // Debug mode
})

// Interactive execution
await execa('claude', [...args, '--', prompt], {
  stdio: 'inherit',  // Direct terminal streaming
  timeout: 0,        // Disabled timeout
  verbose: logger.isDebugEnabled()
})
```

---

## 2. What "Headless Mode" Means

### Definition

"Headless mode" refers to running Claude CLI with the `-p` flag to produce machine-readable output that can be captured and processed programmatically.

### Technical Implementation

| Aspect | Headless | Interactive |
|--------|----------|-------------|
| **Flag** | `-p` (pipe mode) | None |
| **Input** | Via stdin | Via `--` prompt argument |
| **Output** | Captured stdout | Streamed to terminal (stdio: 'inherit') |
| **Return Value** | String output | void |
| **Use Case** | Data generation (branch names, JSON) | User-facing workflows |
| **Timeout** | Disabled (timeout: 0) | Disabled (timeout: 0) |
| **Debug Verbosity** | Controlled by logger.isDebugEnabled() | Controlled by logger.isDebugEnabled() |

### Code Location

**In `claude.ts` lines 116-139:**
```typescript
if (headless) {
  // Headless mode: capture and return output
  const result = await execa('claude', args, {
    input: prompt,
    timeout: 0,
    ...(addDir && { cwd: addDir }),
    verbose: logger.isDebugEnabled(),
  })
  return result.stdout.trim()
} else {
  // Interactive mode: inherit stdio for direct terminal interaction
  await execa('claude', [...args, '--', prompt], {
    ...(addDir && { cwd: addDir }),
    stdio: 'inherit',
    timeout: 0,
    verbose: logger.isDebugEnabled(),
  })
}
```

### Usage Examples

1. **Branch Name Generation (Headless)**
   ```typescript
   const result = await launchClaude(prompt, { headless: true, model: 'haiku' })
   // Returns: "feat/issue-165-empty-repo-handling"
   ```

2. **Issue Workflow (Interactive)**
   ```typescript
   await launchClaude(systemPrompt, { headless: false, addDir: worktreePath })
   // User sees Claude UI in current terminal
   ```

---

## 3. Current Debug/Logging Infrastructure

### Global Debug Logger
**File:** `/Users/adam/Documents/Projects/iloom-cli/fix-issue-165-empty-repo-start/src/utils/logger.ts`

The logger provides structured output with emoji prefixes:

```typescript
export const logger: Logger = {
  info: (msg) => console.log(`🗂️  ${msg}`)      // stdout - blue
  success: (msg) => console.log(`✅ ${msg}`)     // stdout - green
  warn: (msg) => console.error(`⚠️  ${msg}`)    // stderr - yellow
  error: (msg) => console.error(`❌ ${msg}`)    // stderr - red
  debug: (msg) => ...                           // stdout - gray (if enabled)
  setDebug: (enabled) => ...
  isDebugEnabled: () => boolean
}
```

### Debug Activation Methods

**1. Environment Variable:**
```bash
ILOOM_DEBUG=true il start 123
```

**2. CLI Flag:**
```bash
il --debug start 123
```

**3. Programmatic:**
```typescript
logger.setDebug(true)
if (logger.isDebugEnabled()) { /* ... */ }
```

### Debug Output Locations

1. **In CLI startup** (`src/cli.ts` lines 42-52):
   ```typescript
   .hook('preAction', async (thisCommand) => {
     const debugEnabled = options.debug || process.env.ILOOM_DEBUG === 'true'
     logger.setDebug(debugEnabled)
   })
   ```

2. **In Claude utilities** (`src/utils/claude.ts`):
   - Branch name generation progress
   - Claude CLI command construction
   - Version detection
   - Error details

3. **In ignite command** (`src/commands/ignite.ts`):
   - Context auto-detection
   - Template variable substitution
   - MCP configuration generation
   - Agent loading

### Debug Output Examples

```
🔍 Generating branch name with Claude { issueNumber: 165, issueTitle: '...' }
🔍 Sending prompt to Claude { prompt: '<Task>...' }
🔍 Claude returned branch name { branchName: 'feat/issue-165-empty-repo-start', issueNumber: 165 }
🔍 Auto-detected issue #165 from directory: issue-165-work
🔍 Launching Claude in current terminal { type: 'issue', model: 'claude-sonnet-4-20250514', ... }
```

---

## 4. Existing JSON Output and Streaming Capabilities

### JSON Output Support

**Current Implementation:** Limited to `list` command

**File:** `/Users/adam/Documents/Projects/iloom-cli/fix-issue-165-empty-repo-start/src/cli.ts` (lines 320-340)

```typescript
program
  .command('list')
  .option('--json', 'Output as JSON')
  .action(async (options: { json?: boolean }) => {
    const manager = new GitWorktreeManager()
    const worktrees = await manager.listWorktrees({ porcelain: true })

    if (options.json) {
      console.log(JSON.stringify(worktrees, null, 2))
      return
    }
    // Human-readable output with emoji formatting
  })
```

**Behavior:**
- `il list` - Human-readable with logger formatting (emoji + colors)
- `il list --json` - Raw JSON output (no emoji, no colors)

### Streaming Capabilities

**Current State:** Not implemented for Claude output

**Why Interactive Mode Uses Streaming:**
- When `headless: false`, the code uses `stdio: 'inherit'` to stream all Claude output directly to the current terminal
- This allows real-time interaction with Claude (user can see responses as they're generated)
- No capture or buffering of output

**Code (claude.ts lines 131-139):**
```typescript
await execa('claude', [...args, '--', prompt], {
  ...(addDir && { cwd: addDir }),
  stdio: 'inherit',  // <-- Enables streaming
  timeout: 0,
  verbose: logger.isDebugEnabled(),
})
```

### No Current JSON Streaming

There is **no current mechanism** to:
- Stream Claude responses as JSON
- Output Claude responses as newline-delimited JSON (NDJSON)
- Expose individual tool calls as JSON events
- Provide real-time status updates in JSON format

The design prioritizes interactive user experience over machine consumption of Claude output.

---

## 5. Service Layer Architecture

### ClaudeService Class
**File:** `/Users/adam/Documents/Projects/iloom-cli/fix-issue-165-empty-repo-start/src/lib/ClaudeService.ts`

Provides workflow-specific launching:

```typescript
async launchForWorkflow(options: ClaudeWorkflowOptions): Promise<string | void>
```

**Responsibilities:**
- Determine model based on workflow type (issue → sonnet, others → default)
- Determine permission mode from settings or defaults
- Load and format agent configurations
- Generate MCP server configurations
- Append system prompt instructions
- Delegate to `launchClaude()` for actual execution

**Workflow Types:**
- `'issue'` - Issue-based workflows (model: sonnet, permission: acceptEdits)
- `'pr'` - Pull request workflows (model: default, permission: default)
- `'regular'` - Generic workflows (model: default, permission: default)

---

## 6. Context Management Layer

### ClaudeContextManager
**File:** `/Users/adam/Documents/Projects/iloom-cli/fix-issue-165-empty-repo-start/src/lib/ClaudeContextManager.ts`

Bridges context preparation and Claude launching:

```typescript
async launchWithContext(context: ClaudeContext, headless: boolean): Promise<string | void>
```

### Context Detection in IgniteCommand
**File:** `/Users/adam/Documents/Projects/iloom-cli/fix-issue-165-empty-repo-start/src/commands/ignite.ts`

Auto-detects workspace context by:

1. **Directory name patterns:**
   - Issue: `issue-165` matches `/issue-(\d+)/`
   - PR: `_pr_123` matches `/_pr_(\d+)$/`

2. **Git branch name patterns:**
   - Extracts issue/PR numbers from branch names if directory doesn't match

3. **Fallback:**
   - Uses `'regular'` workflow if no patterns match

**Detection Priority:**
```
Directory PR pattern → Directory issue pattern → Git branch pattern → Regular workflow
```

---

## 7. Integration Points and Data Flow

### Entry Points to Claude

1. **Start Command** (`il start <issue>`):
   - Creates worktree and environment
   - Calls LoomLauncher to open terminals
   - LoomLauncher → ClaudeContextManager → ClaudeService → launchClaude()

2. **Ignite Command** (`il ignite`):
   - Auto-detects context in current directory
   - Loads prompt templates and agents
   - Directly calls launchClaude() with system instructions

3. **Branch Name Generation** (Internal):
   - Called during workspace creation
   - Uses headless mode to generate branch name from issue title
   - Returns: `string` (the generated branch name)

4. **Finish Command** (Potential):
   - Could use Claude for error fixing or interactive conflict resolution
   - Not yet implemented for main workflow

### Data Flow Diagram

```
Command Input (e.g., il start 123)
    ↓
Command Handler (StartCommand, FinishCommand, etc.)
    ↓
LoomMananger/LoomLauncher
    ↓
ClaudeContextManager.launchWithContext()
    ↓
ClaudeService.launchForWorkflow()
    ↓
Determine: Model, Permission Mode, Agents, MCP Config
    ↓
Build: System Prompt, User Prompt, Flags
    ↓
launchClaude(userPrompt, options)
    ↓
execa('claude', args, { stdio: 'inherit' | input })
    ↓
[Headless Mode] → Capture stdout → Return string
[Interactive Mode] → Stream to terminal → Return void
```

---

## 8. Agent System Architecture

### Agent Loading
**File:** `/Users/adam/Documents/Projects/iloom-cli/fix-issue-165-empty-repo-start/src/lib/AgentManager.ts`

```typescript
async loadAgents(settings?: IloomSettings): Promise<AgentConfigs>
```

**Process:**
1. Load markdown files from agent directory
2. Parse YAML frontmatter for metadata
3. Extract markdown body as prompt
4. Apply settings overrides (custom models per agent)
5. Validate all required fields
6. Return object suitable for `--agents` flag

**Agent Definition Format** (markdown with frontmatter):
```yaml
---
name: iloom-issue-implementer
description: Implements the solution for an issue
model: sonnet
tools: fetch_webpage, read_file, write_file, bash
color: blue
---

[Markdown prompt body...]
```

**Current Agents:**
- `iloom-issue-analyzer` - Analyzes issues
- `iloom-issue-planner` - Plans implementation approach
- `iloom-issue-implementer` - Writes code
- `iloom-issue-reviewer` - Reviews implementation
- `iloom-issue-enhancer` - Enhances issues with details
- `iloom-issue-analyze-and-plan` - Combined analyzer/planner
- `iloom-issue-complexity-evaluator` - Evaluates issue complexity

---

## 9. MCP Integration

### MCP Configuration for GitHub Integration
**Generated in:** `src/commands/ignite.ts` (lines 472-502)

**Purpose:** Provide Claude with GitHub issue/PR commenting capabilities

**Configuration Structure:**
```javascript
{
  mcpServers: {
    github_comment: {
      transport: 'stdio',
      command: 'node',
      args: ['/path/to/github-comment-server.js'],
      env: {
        REPO_OWNER: 'owner',
        REPO_NAME: 'repo',
        GITHUB_EVENT_NAME: 'issues' | 'pull_request',
        GITHUB_API_URL: 'https://api.github.com/'
      }
    }
  }
}
```

**Tool Filtering for Issue/PR Workflows:**
```typescript
allowedTools: [
  'mcp__github_comment__create_comment',
  'mcp__github_comment__update_comment',
]
disallowedTools: ['Bash(gh api:*)']
```

---

## 10. Settings and Configuration

### Settings File Location
`~/.iloom/settings.json`

### Configurable Options

**Workflow-specific settings:**
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
    "pr": { ... },
    "regular": { ... }
  },
  "agents": {
    "agentName": {
      "model": "opus"  // Override default agent model
    }
  }
}
```

### Settings Loading
**File:** `src/lib/SettingsManager.ts`

Loaded at CLI startup with validation. Invalid JSON causes CLI to exit with error.

---

## 11. Terminal Window Integration

### Opening New Terminal Windows

**File:** `src/utils/terminal.ts` (macOS only)

Opens terminal tabs with:
- Background color based on branch name (consistent color hashing)
- Environment sourcing (`.env` file if exists)
- Port export (if development server)
- Command execution (e.g., `il ignite` for Claude launch)

**Supported Platforms:**
- macOS (AppleScript via Terminal.app)
- Linux: Not yet supported
- Windows: Not yet supported

---

## 12. Prompt Templates

### Template Location
`templates/prompts/` directory

**Available Templates:**
1. `issue-prompt.txt` - For issue workflows
2. `pr-prompt.txt` - For PR workflows
3. `regular-prompt.txt` - For regular branch workflows

### Template Variables
Substituted via `PromptTemplateManager`:
- `{WORKSPACE_PATH}` - Current worktree path
- `{ISSUE_NUMBER}` - Issue number
- `{ISSUE_TITLE}` - Issue title
- `{PR_NUMBER}` - PR number
- `{PR_TITLE}` - PR title
- `{PORT}` - Development server port
- `{ONE_SHOT_MODE}` - Conditional flag for bypass behavior

---

## Summary of Current Capabilities

### Implemented
✅ Headless mode (for branch name generation, JSON output)
✅ Interactive mode (for user-facing workflows)
✅ Debug logging via `ILOOM_DEBUG` or `--debug`
✅ JSON output for `list` command
✅ Agent system with custom model overrides
✅ MCP integration for GitHub comments
✅ Permission mode configuration
✅ Prompt templates with variable substitution
✅ One-shot automation modes (noReview, bypassPermissions)
✅ Auto-context detection from directory/branch names

### Not Implemented
❌ JSON streaming of Claude responses (NDJSON format)
❌ Real-time event streaming (e.g., tool calls as they happen)
❌ JSON output option for interactive workflows
❌ Structured output formats for error/status reporting
❌ Non-macOS terminal window support (Linux, Windows)
❌ Custom timeout configuration via settings
❌ Tool execution hooks or middleware
❌ Response parsing or transformation pipeline

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/utils/claude.ts` | Core Claude invocation (`launchClaude()`) |
| `src/lib/ClaudeService.ts` | Workflow-specific Claude launching |
| `src/lib/ClaudeContextManager.ts` | Context preparation and delegation |
| `src/commands/ignite.ts` | Auto-detection and Claude launch |
| `src/utils/logger.ts` | Structured logging with emoji prefixes |
| `src/lib/AgentManager.ts` | Agent loading and configuration |
| `src/utils/terminal.ts` | Terminal window opening (macOS) |
| `src/cli.ts` | CLI entrypoint with debug flag handling |
| `templates/prompts/` | Prompt templates |
| `templates/agents/` | Agent definitions |

