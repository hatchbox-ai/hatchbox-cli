export type ProjectCapability = 'cli' | 'web'
export type Capability = ProjectCapability

export interface Hatchbox {
  id: string
  path: string
  branch: string
  type: 'issue' | 'pr' | 'branch'
  identifier: string | number
  port: number
  databaseBranch?: string
  createdAt: Date
  lastAccessed: Date
  githubData?: {
    title?: string
    body?: string
    url?: string
    state?: string
  }
  capabilities?: ProjectCapability[]
  binEntries?: Record<string, string>
  cliSymlinks?: string[]
}

export interface CreateHatchboxInput {
  type: 'issue' | 'pr' | 'branch'
  identifier: string | number
  originalInput: string
  baseBranch?: string
  options?: {
    skipDatabase?: boolean
    skipColorSync?: boolean
    // Individual component flags
    enableClaude?: boolean
    enableCode?: boolean
    enableDevServer?: boolean
    // One-shot automation mode
    oneShot?: import('./index.js').OneShotMode
    // Raw --set arguments to forward to ignite
    setArguments?: string[]
    // Executable path to use for ignite command (e.g., 'hb', 'hb-125', or '/path/to/dist/cli.js')
    executablePath?: string
  }
}

export type LaunchMode = 'editor' | 'terminal' | 'both'

export interface HatchboxSummary {
  id: string
  type: 'issue' | 'pr' | 'branch'
  identifier: string | number
  title?: string
  branch: string
  port: number
  status: 'active' | 'stale' | 'error'
  lastAccessed: string
}
