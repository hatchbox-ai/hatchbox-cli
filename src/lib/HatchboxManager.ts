import path from 'path'
import { GitWorktreeManager } from './GitWorktreeManager.js'
import { GitHubService } from './GitHubService.js'
import { EnvironmentManager } from './EnvironmentManager.js'
import { ClaudeContextManager } from './ClaudeContextManager.js'
import { ProjectCapabilityDetector } from './ProjectCapabilityDetector.js'
import { CLIIsolationManager } from './CLIIsolationManager.js'
import { VSCodeIntegration } from './VSCodeIntegration.js'
import { branchExists } from '../utils/git.js'
import { installDependencies } from '../utils/package-manager.js'
import { generateColorFromBranchName } from '../utils/color.js'
// import { DatabaseManager } from './DatabaseManager.js'
import type { Hatchbox, CreateHatchboxInput } from '../types/hatchbox.js'
import type { GitWorktree } from '../types/worktree.js'
import type { Issue, PullRequest } from '../types/index.js'
import { logger } from '../utils/logger.js'

/**
 * HatchboxManager orchestrates the creation and management of hatchboxes (isolated workspaces)
 * Bridges the gap between input validation and workspace operations
 */
export class HatchboxManager {
  constructor(
    private gitWorktree: GitWorktreeManager,
    private github: GitHubService,
    private environment: EnvironmentManager,
    _claude: ClaudeContextManager, // Not stored - kept for DI compatibility, HatchboxLauncher creates its own
    private capabilityDetector: ProjectCapabilityDetector,
    private cliIsolation: CLIIsolationManager
    // private database?: DatabaseManager  // Will be used in future for database branching
  ) {}

  /**
   * Create a new hatchbox (isolated workspace)
   * Orchestrates worktree creation, environment setup, and Claude context generation
   * NEW: Checks for existing worktrees and reuses them if found
   */
  async createHatchbox(input: CreateHatchboxInput): Promise<Hatchbox> {
    // 1. Fetch GitHub data if needed
    logger.info('Fetching GitHub data...')
    const githubData = await this.fetchGitHubData(input)

    // NEW: Check for existing worktree BEFORE generating branch name (for efficiency)
    if (input.type === 'issue' || input.type === 'pr') {
      logger.info('Checking for existing worktree...')
      const existing = await this.findExistingHatchbox(input, githubData)
      if (existing) {
        logger.success(`Found existing worktree, reusing: ${existing.path}`)
        return await this.reuseHatchbox(existing, input, githubData)
      }
      logger.info('No existing worktree found, creating new one...')
    }

    // 2. Generate or validate branch name
    logger.info('Preparing branch name...')
    const branchName = await this.prepareBranchName(input, githubData)

    // 3. Create git worktree
    logger.info('Creating git worktree...')
    const worktreePath = await this.createWorktree(input, branchName)

    // 4. Detect project capabilities
    const { capabilities, binEntries } = await this.capabilityDetector.detectCapabilities(worktreePath)

    // 5. Setup environment based on capabilities
    let port = 3000 // default
    if (capabilities.includes('web')) {
      port = await this.setupEnvironment(worktreePath, input)
    }

    // 6. Setup CLI isolation if project has CLI capability
    let cliSymlinks: string[] | undefined = undefined
    if (capabilities.includes('cli')) {
      try {
        cliSymlinks = await this.cliIsolation.setupCLIIsolation(
          worktreePath,
          input.identifier,
          binEntries
        )
      } catch (error) {
        // Log warning but don't fail - matches dependency installation behavior
        logger.warn(
          `Failed to setup CLI isolation: ${error instanceof Error ? error.message : 'Unknown error'}`,
          error
        )
      }
    }

    // 7. Apply color synchronization (terminal and VSCode)
    if (!input.options?.skipColorSync) {
      try {
        await this.applyColorSynchronization(worktreePath, branchName)
      } catch (error) {
        // Log warning but don't fail - colors are cosmetic
        logger.warn(
          `Failed to apply color synchronization: ${error instanceof Error ? error.message : 'Unknown error'}`,
          error
        )
      }
    }

    // NEW: Move issue to In Progress (for new worktrees)
    if (input.type === 'issue') {
      try {
        logger.info('Moving issue to In Progress...')
        await this.github.moveIssueToInProgress(input.identifier as number)
      } catch (error) {
        // Warn but don't fail - matches bash script behavior
        logger.warn(
          `Failed to move issue to In Progress: ${error instanceof Error ? error.message : 'Unknown error'}`,
          error
        )
      }
    }

    // 8. Launch workspace components based on individual flags
    const enableClaude = input.options?.enableClaude !== false
    const enableCode = input.options?.enableCode !== false
    const enableDevServer = input.options?.enableDevServer !== false

    // Only launch if at least one component is enabled
    if (enableClaude || enableCode || enableDevServer) {
      const { HatchboxLauncher } = await import('./HatchboxLauncher.js')
      const launcher = new HatchboxLauncher()

      await launcher.launchHatchbox({
        enableClaude,
        enableCode,
        enableDevServer,
        worktreePath,
        branchName,
        port,
        capabilities,
        workflowType: input.type === 'branch' ? 'regular' : input.type,
        identifier: input.identifier,
        ...(githubData?.title && { title: githubData.title }),
      })
    }

    // 8. SKIP - DO NOT IMPLEMENT YET: Setup database branch
    let databaseBranch: string | undefined = undefined
    // Database branch creation will be implemented when needed
    // if (this.database && !input.options?.skipDatabase) {
    //   databaseBranch = await this.database.createBranch(branchName)
    // }

    // 9. Create and return hatchbox metadata
    const hatchbox: Hatchbox = {
      id: this.generateHatchboxId(input),
      path: worktreePath,
      branch: branchName,
      type: input.type,
      identifier: input.identifier,
      port,
      createdAt: new Date(),
      lastAccessed: new Date(),
      ...(databaseBranch !== undefined && { databaseBranch }),
      ...(capabilities.length > 0 && { capabilities }),
      ...(Object.keys(binEntries).length > 0 && { binEntries }),
      ...(cliSymlinks && cliSymlinks.length > 0 && { cliSymlinks }),
      ...(githubData !== null && {
        githubData: {
          title: githubData.title,
          body: githubData.body,
          url: githubData.url,
          state: githubData.state,
        },
      }),
    }

    logger.success(`Created hatchbox: ${hatchbox.id} at ${hatchbox.path}`)
    return hatchbox
  }

  /**
   * Finish a hatchbox (merge work and cleanup)
   * Not yet implemented - see Issue #7
   */
  async finishHatchbox(_identifier: string): Promise<void> {
    throw new Error('Not implemented - see Issue #7')
  }

  /**
   * Cleanup a hatchbox (remove workspace)
   * Not yet implemented - see Issue #8
   */
  async cleanupHatchbox(_identifier: string): Promise<void> {
    throw new Error('Not implemented - see Issue #8')
  }

  /**
   * List all active hatchboxes
   */
  async listHatchboxes(): Promise<Hatchbox[]> {
    const worktrees = await this.gitWorktree.listWorktrees()
    return this.mapWorktreesToHatchboxes(worktrees)
  }

  /**
   * Find a specific hatchbox by identifier
   */
  async findHatchbox(identifier: string): Promise<Hatchbox | null> {
    const hatchboxes = await this.listHatchboxes()
    return (
      hatchboxes.find(
        h =>
          h.id === identifier ||
          h.identifier.toString() === identifier ||
          h.branch === identifier
      ) ?? null
    )
  }

  /**
   * Fetch GitHub data based on input type
   */
  private async fetchGitHubData(
    input: CreateHatchboxInput
  ): Promise<Issue | PullRequest | null> {
    if (input.type === 'issue') {
      return await this.github.fetchIssue(input.identifier as number)
    } else if (input.type === 'pr') {
      return await this.github.fetchPR(input.identifier as number)
    }
    return null
  }

  /**
   * Prepare branch name based on input type and GitHub data
   */
  private async prepareBranchName(
    input: CreateHatchboxInput,
    githubData: Issue | PullRequest | null
  ): Promise<string> {
    if (input.type === 'branch') {
      return input.identifier as string
    }

    if (input.type === 'pr' && githubData && 'branch' in githubData) {
      return githubData.branch
    }

    if (input.type === 'issue' && githubData) {
      // Use Claude AI-powered branch name generation
      const branchName = await this.github.generateBranchName({
        issueNumber: input.identifier as number,
        title: githubData.title,
      })
      return branchName
    }

    // Fallback for edge cases
    if (input.type === 'pr') {
      return `pr-${input.identifier}`
    }

    throw new Error(`Unable to determine branch name for input type: ${input.type}`)
  }

  /**
   * Create worktree for the hatchbox
   */
  private async createWorktree(
    input: CreateHatchboxInput,
    branchName: string
  ): Promise<string> {
    const worktreePath = this.gitWorktree.generateWorktreePath(
      branchName,
      undefined,
      input.type === 'pr'
        ? { isPR: true, prNumber: input.identifier as number }
        : undefined
    )

    // Check if branch already exists before attempting to create worktree
    if (input.type !== 'pr') {
      const exists = await branchExists(branchName)
      if (exists) {
        throw new Error(
          `Cannot create worktree: branch '${branchName}' already exists. ` +
          `Use 'git branch -D ${branchName}' to delete it first if needed.`
        )
      }
    }

    await this.gitWorktree.createWorktree({
      path: worktreePath,
      branch: branchName,
      createBranch: input.type !== 'pr', // PRs use existing branches
      ...(input.baseBranch && { baseBranch: input.baseBranch }),
    })

    // Install dependencies in the new worktree
    try {
      await installDependencies(worktreePath, true)
    } catch (error) {
      // Log warning but don't fail - matches bash script behavior (lines 764-765)
      logger.warn(`Failed to install dependencies: ${error instanceof Error ? error.message : 'Unknown error'}`, error)
    }

    return worktreePath
  }

  /**
   * Setup environment for the hatchbox
   */
  private async setupEnvironment(
    worktreePath: string,
    input: CreateHatchboxInput
  ): Promise<number> {
    const envFilePath = path.join(worktreePath, '.env')

    const issueNumber = input.type === 'issue' ? (input.identifier as number) : undefined
    const prNumber = input.type === 'pr' ? (input.identifier as number) : undefined

    return await this.environment.setPortForWorkspace(envFilePath, issueNumber, prNumber)
  }

  /**
   * Generate a unique hatchbox ID
   */
  private generateHatchboxId(input: CreateHatchboxInput): string {
    const prefix = input.type
    return `${prefix}-${input.identifier}`
  }

  /**
   * Calculate port for the hatchbox
   * Base port: 3000 + issue/PR number (or random for branches)
   */
  private calculatePort(input: CreateHatchboxInput): number {
    const basePort = 3000
    if (input.type === 'issue' && typeof input.identifier === 'number') {
      return basePort + input.identifier
    }
    if (input.type === 'pr' && typeof input.identifier === 'number') {
      return basePort + input.identifier
    }
    // Default for branch-based hatchboxes - random port
    return basePort + Math.floor(Math.random() * 1000)
  }


  /**
   * Apply color synchronization to both VSCode and terminal
   * Colors are cosmetic - errors are logged but don't block workflow
   */
  private async applyColorSynchronization(
    worktreePath: string,
    branchName: string
  ): Promise<void> {
    const colorData = generateColorFromBranchName(branchName)

    // Apply VSCode title bar color
    const vscode = new VSCodeIntegration()
    await vscode.setTitleBarColor(worktreePath, colorData.hex)

    logger.info(`Applied VSCode title bar color: ${colorData.hex} for branch: ${branchName}`)

    // Note: Terminal color is applied during window creation in ClaudeContextManager
    // This ensures the color is set when the new terminal window is opened
  }

  /**
   * Map worktrees to hatchbox objects
   * This is a simplified conversion - in production we'd store hatchbox metadata
   */
  private mapWorktreesToHatchboxes(worktrees: GitWorktree[]): Hatchbox[] {
    return worktrees.map(wt => {
      // Extract identifier from branch name
      let type: 'issue' | 'pr' | 'branch' = 'branch'
      let identifier: string | number = wt.branch

      if (wt.branch.startsWith('issue-')) {
        type = 'issue'
        identifier = parseInt(wt.branch.replace('issue-', ''), 10)
      } else if (wt.branch.startsWith('pr-')) {
        type = 'pr'
        identifier = parseInt(wt.branch.replace('pr-', ''), 10)
      }

      return {
        id: `${type}-${identifier}`,
        path: wt.path,
        branch: wt.branch,
        type,
        identifier,
        port: this.calculatePort({ type, identifier, originalInput: '' }),
        createdAt: new Date(),
        lastAccessed: new Date(),
      }
    })
  }

  /**
   * NEW: Find existing hatchbox for the given input
   * Checks for worktrees matching the issue/PR identifier
   */
  private async findExistingHatchbox(
    input: CreateHatchboxInput,
    githubData: Issue | PullRequest | null
  ): Promise<GitWorktree | null> {
    if (input.type === 'issue') {
      return await this.gitWorktree.findWorktreeForIssue(input.identifier as number)
    } else if (input.type === 'pr' && githubData && 'branch' in githubData) {
      return await this.gitWorktree.findWorktreeForPR(
        input.identifier as number,
        githubData.branch
      )
    }
    return null
  }

  /**
   * NEW: Reuse an existing hatchbox
   * Skips worktree/dependency setup, but still launches components
   * Ports: handle_existing_worktree() from bash script lines 168-215
   */
  private async reuseHatchbox(
    worktree: GitWorktree,
    input: CreateHatchboxInput,
    githubData: Issue | PullRequest | null
  ): Promise<Hatchbox> {
    const worktreePath = worktree.path
    const branchName = worktree.branch

    // 1. Detect capabilities (quick, no installation)
    const { capabilities, binEntries } = await this.capabilityDetector.detectCapabilities(worktreePath)

    // 2. Get port from environment or calculate
    let port = 3000
    if (capabilities.includes('web')) {
      port = this.calculatePort(input)
    }

    // NEW: Move issue to In Progress (for reused worktrees too)
    if (input.type === 'issue') {
      try {
        logger.info('Moving issue to In Progress...')
        await this.github.moveIssueToInProgress(input.identifier as number)
      } catch (error) {
        logger.warn(
          `Failed to move issue to In Progress: ${error instanceof Error ? error.message : 'Unknown error'}`,
          error
        )
      }
    }

    // 3. Launch components (same as new worktree)
    const enableClaude = input.options?.enableClaude !== false
    const enableCode = input.options?.enableCode !== false
    const enableDevServer = input.options?.enableDevServer !== false

    if (enableClaude || enableCode || enableDevServer) {
      logger.info('Launching workspace components...')
      const { HatchboxLauncher } = await import('./HatchboxLauncher.js')
      const launcher = new HatchboxLauncher()

      await launcher.launchHatchbox({
        enableClaude,
        enableCode,
        enableDevServer,
        worktreePath,
        branchName,
        port,
        capabilities,
        workflowType: input.type === 'branch' ? 'regular' : input.type,
        identifier: input.identifier,
        ...(githubData?.title && { title: githubData.title }),
      })
    }

    // 4. Return hatchbox metadata
    const hatchbox: Hatchbox = {
      id: this.generateHatchboxId(input),
      path: worktreePath,
      branch: branchName,
      type: input.type,
      identifier: input.identifier,
      port,
      createdAt: new Date(), // We don't have actual creation date, use now
      lastAccessed: new Date(),
      ...(capabilities.length > 0 && { capabilities }),
      ...(Object.keys(binEntries).length > 0 && { binEntries }),
      ...(githubData !== null && {
        githubData: {
          title: githubData.title,
          body: githubData.body,
          url: githubData.url,
          state: githubData.state,
        },
      }),
    }

    logger.success(`Reused existing hatchbox: ${hatchbox.id} at ${hatchbox.path}`)
    return hatchbox
  }
}
