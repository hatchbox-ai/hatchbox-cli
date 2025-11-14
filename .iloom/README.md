# iloom Settings

This directory contains configuration files for iloom workflows.

## settings.json

The `settings.json` file allows you to customize iloom's behavior for your project.

### Configuration Options

#### mainBranch (optional)
Specifies the name of your main/primary branch. This is used by iloom to determine where to merge completed work.

**Default**: If not specified, iloom will try to detect it automatically by looking for a "main" branch or using the first worktree found.

**Example**:
```json
{
  "mainBranch": "main"
}
```

#### worktreePrefix (optional)
Configures the directory prefix used when creating worktrees. This allows you to customize where and how worktree directories are named.

**Default**: `<repo-folder-name>-looms` (e.g., if your repo is in `/Users/dev/my-project`, the default prefix is `my-project-looms`)

**Allowed characters**: Alphanumeric, hyphens (`-`), underscores (`_`), and forward slashes (`/`)

**Prefix Behavior Examples**:

| Configuration | Worktree Path Result | Explanation |
|---------------|---------------------|-------------|
| `"looms"` | `looms-issue-123` | Auto-append hyphen |
| `"looms-"` | `looms-issue-123` | Preserve explicit separator |
| `"looms/"` | `looms/issue-123` | Explicit folder mode |
| `"temp/iloom"` | `temp/iloom-issue-123` | Auto-append hyphen to last part |
| `"temp/iloom-"` | `temp/iloom-issue-123` | Preserve explicit separator |
| `"temp/looms/"` | `temp/looms/issue-123` | Explicit nested folder mode |
| `""` (empty string) | `issue-123` | No prefix mode |
| `undefined` (not set) | `<repo-name>-looms/issue-123` | Use calculated default |

**Key Rules**:
- Only an explicit trailing `/` creates a subfolder
- Otherwise, the last part is always treated as a prefix with auto-appended `-` (if not already present)
- Backslashes are not allowed (use forward slashes for cross-platform compatibility)
- Spaces and special characters (`*?"<>|:`) are not allowed

**Examples**:
```json
{
  "worktreePrefix": "worktrees"
}
```

```json
{
  "worktreePrefix": "temp/branches/"
}
```

```json
{
  "worktreePrefix": ""
}
```

#### workflows (optional)
Configure per-workflow permission modes for Claude CLI. This allows you to control how Claude interacts with your code in different workflow contexts.

**Available workflow types**:
- `issue` - When working on GitHub issues (using `il start <issue-number>`)
- `pr` - When working on pull requests (using `il start <pr-number>`)
- `regular` - When working on regular branches (using `il start <branch-name>`)

**Available permission modes**:
- `plan` - Claude will create a plan and ask for approval before making changes
- `acceptEdits` - Claude will make changes but wait for you to accept each edit
- `bypassPermissions` - Claude will make changes directly without asking (requires `--dangerously-skip-permissions` flag in Claude CLI)
- `default` - Use Claude CLI's default permission behavior (no flags passed)

**Component launch settings**:
- `startIde` - Launch IDE (VSCode) when starting workflow (default: true)
- `startDevServer` - Launch development server in terminal when starting workflow (default: true)
- `startAiAgent` - Launch Claude AI agent when starting workflow (default: true)
- `startTerminal` - Launch terminal window without dev server when starting workflow (default: false)

**Example**:
```json
{
  "workflows": {
    "issue": {
      "permissionMode": "acceptEdits",
      "startIde": true,
      "startDevServer": true,
      "startAiAgent": true,
      "startTerminal": false
    },
    "pr": {
      "permissionMode": "plan",
      "startIde": true,
      "startDevServer": false,
      "startAiAgent": true,
      "startTerminal": true
    },
    "regular": {
      "permissionMode": "bypassPermissions"
    }
  }
}
```

**Use cases**:
- **`plan` mode for PRs**: When reviewing someone else's PR, you might want Claude to plan changes carefully before executing
- **`acceptEdits` mode for issues**: When implementing new features, you might want Claude to suggest changes but let you review each one
- **`bypassPermissions` mode for regular work**: For your own branches where you trust Claude to work autonomously
- **`default` mode**: When you want standard Claude CLI behavior without any special permissions

#### agents (optional)
Configure Claude model preferences for different agent types. This allows you to use more powerful or faster models depending on the task.

**Available models**:
- `sonnet` - Balanced performance and speed (default)
- `opus` - Most capable model for complex tasks
- `haiku` - Fastest model for simple tasks

**Example**:
```json
{
  "agents": {
    "code-reviewer": {
      "model": "opus"
    },
    "quick-fixes": {
      "model": "haiku"
    },
    "default": {
      "model": "sonnet"
    }
  }
}
```

#### capabilities.web.basePort (optional)
Configure the base port number for web workspace port calculations. Each workspace gets a unique port calculated as `basePort + identifier`.

**Default**: `3000`

**Valid Range**: `1` to `65535` (ports 1-1023 are typically reserved by the system, but the validation allows them)

**Port Calculation**:
- **Issue workspaces**: `basePort + issueNumber`
  - Example: basePort `8080` + issue `#42` = port `8122`
- **PR workspaces**: `basePort + prNumber`
  - Example: basePort `8080` + PR `#100` = port `8180`
- **Branch workspaces**: `basePort + deterministic_hash(branchName) % 999 + 1`
  - Example: basePort `8080` + hash offset (1-999) = port `8081-9079`

**Example**:
```json
{
  "capabilities": {
    "web": {
      "basePort": 8080
    }
  }
}
```

**Port Limit Errors**:
If the calculated port exceeds `65535`, workspace creation will fail with an error.
- Example: `basePort: 60000` + `issue: 10000` = `70000` (EXCEEDS LIMIT)
- Solution: Use a lower base port or work with lower-numbered issues/PRs

**Use cases**:
- **Avoid port conflicts**: If port `3000` is already in use by another application
- **Project conventions**: Match your project's standard development port (e.g., `8080`, `5000`)
- **Multiple projects**: Use different base ports for different projects to avoid conflicts

### Complete Example

Here's a complete example showing all available options:

```json
{
  "mainBranch": "main",
  "worktreePrefix": "temp/branches",
  "workflows": {
    "issue": {
      "permissionMode": "acceptEdits"
    },
    "pr": {
      "permissionMode": "plan"
    },
    "regular": {
      "permissionMode": "bypassPermissions"
    }
  },
  "agents": {
    "code-reviewer": {
      "model": "opus"
    },
    "quick-fixes": {
      "model": "haiku"
    },
    "default": {
      "model": "sonnet"
    }
  },
  "capabilities": {
    "web": {
      "basePort": 8080
    }
  }
}
```

### Minimal Example

All fields are optional. You can start with an empty configuration and add settings as needed:

```json
{}
```

Or just configure the settings you need:

```json
{
  "mainBranch": "develop"
}
```

### Validation

The settings file is validated when loaded. Common validation errors:

- **Invalid permission mode**: Must be one of `plan`, `acceptEdits`, `bypassPermissions`, or `default`
- **Invalid model**: Must be one of `sonnet`, `opus`, or `haiku`
- **Empty mainBranch**: If provided, mainBranch cannot be an empty string
- **Invalid worktreePrefix**: Only alphanumeric characters, hyphens (`-`), underscores (`_`), and forward slashes (`/`) are allowed. Backslashes and spaces are rejected.
- **Invalid basePort**: Must be a number between `1` and `65535`
- **Invalid JSON**: The file must be valid JSON syntax

### Notes

- All settings are optional - iloom will use sensible defaults if settings are not provided
- Settings are loaded from `<project-root>/.iloom/settings.json`
- If the file doesn't exist, iloom will use default behavior without error
- Changes to settings take effect the next time you run an iloom command
