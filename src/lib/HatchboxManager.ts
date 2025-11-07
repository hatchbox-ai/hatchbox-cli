import path from 'path'
import { GitWorktreeManager } from './GitWorktreeManager.js'
import { GitHubService } from './GitHubService.js'
import { EnvironmentManager } from './EnvironmentManager.js'
import { ClaudeContextManager } from './ClaudeContextManager.js'
import { ProjectCapabilityDetector } from './ProjectCapabilityDetector.js'
import { CLIIsolationManager } from './CLIIsolationManager.js'
import { VSCodeIntegration } from './VSCodeIntegration.js'
import { SettingsManager } from './SettingsManager.js'
import { branchExists, executeGitCommand } from '../utils/git.js'
import { installDependencies } from '../utils/package-manager.js'
import { generateColorFromBranchName } from '../utils/color.js'
import { DatabaseManager } from './DatabaseManager.js'
import { loadEnvIntoProcess } from '../utils/env.js'
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
    private cliIsolation: CLIIsolationManager,
    private settings: SettingsManager,
    private database?: DatabaseManager
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

    // 3. Create git worktree (WITHOUT dependency installation)
    logger.info('Creating git worktree...')
    const worktreePath = await this.createWorktreeOnly(input, branchName)

    // 4. Load main .env variables into process.env (like bash script lines 336-339)
    this.loadMainEnvFile()

    // 5. Detect project capabilities
    const { capabilities, binEntries } = await this.capabilityDetector.detectCapabilities(worktreePath)

    // 6. Setup environment based on capabilities (copy .env + set PORT)
    // Load base port from settings
    const settingsData = await this.settings.loadSettings()
    const basePort = settingsData.capabilities?.web?.basePort ?? 3000

    let port = basePort // default
    if (capabilities.includes('web')) {
      port = await this.setupEnvironment(worktreePath, input, basePort)
    }

    // 7. Install dependencies AFTER environment setup (like bash script line 757-769)
    try {
      await installDependencies(worktreePath, true)
    } catch (error) {
      // Log warning but don't fail - matches bash script behavior
      logger.warn(`Failed to install dependencies: ${error instanceof Error ? error.message : 'Unknown error'}`, error)
    }

    // 9. Setup database branch if configured
    let databaseBranch: string | undefined = undefined
    if (this.database && !input.options?.skipDatabase) {
      try {
        const connectionString = await this.database.createBranchIfConfigured(
          branchName,
          path.join(worktreePath, '.env')
        )

        if (connectionString) {
          await this.environment.setEnvVar(
            path.join(worktreePath, '.env'),
            'DATABASE_URL',
            connectionString
          )
          logger.success('Database branch configured')
          databaseBranch = branchName
        }
      } catch (error) {
        logger.error(
          `Failed to setup database branch: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
        throw error  // Database creation failures are fatal
      }
    }

    // 10. Setup CLI isolation if project has CLI capability
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

    // 11. Apply color synchronization (terminal and VSCode)
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
    const oneShot = input.options?.oneShot ?? 'default'
    const setArguments = input.options?.setArguments
    const executablePath = input.options?.executablePath

    // Only launch if at least one component is enabled
    if (enableClaude || enableCode || enableDevServer) {
      const { HatchboxLauncher } = await import('./HatchboxLauncher.js')
      const { ClaudeContextManager } = await import('./ClaudeContextManager.js')

      // Create ClaudeContextManager with shared SettingsManager to ensure CLI overrides work
      const claudeContext = new ClaudeContextManager(undefined, undefined, this.settings)
      const launcher = new HatchboxLauncher(claudeContext)

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
        oneShot,
        ...(setArguments && { setArguments }),
        ...(executablePath && { executablePath }),
      })
    }

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
   * List all active hatchboxes
   */
  async listHatchboxes(): Promise<Hatchbox[]> {
    const worktrees = await this.gitWorktree.listWorktrees()
    return await this.mapWorktreesToHatchboxes(worktrees)
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
   * Create worktree for the hatchbox (without dependency installation)
   */
  private async createWorktreeOnly(
    input: CreateHatchboxInput,
    branchName: string
  ): Promise<string> {
    // Load worktree prefix from settings
    const settingsData = await this.settings.loadSettings()
    const worktreePrefix = settingsData.worktreePrefix

    // Build options object, only including prefix if it's defined
    const pathOptions: { isPR?: boolean; prNumber?: number; prefix?: string } =
      input.type === 'pr'
        ? { isPR: true, prNumber: input.identifier as number }
        : {}

    if (worktreePrefix !== undefined) {
      pathOptions.prefix = worktreePrefix
    }

    const worktreePath = this.gitWorktree.generateWorktreePath(
      branchName,
      undefined,
      pathOptions
    )

    // Fetch all remote branches to ensure we have latest refs (especially for PRs)
    // Ports: bash script lines 667-674
    if (input.type === 'pr') {
      logger.info('Fetching all remote branches...')
      try {
        await executeGitCommand(['fetch', 'origin'], { cwd: this.gitWorktree.workingDirectory })
        logger.success('Successfully fetched from remote')
      } catch (error) {
        throw new Error(
          `Failed to fetch from remote: ${error instanceof Error ? error.message : 'Unknown error'}. ` +
          `Make sure you have access to the repository.`
        )
      }
    }

    // Check if branch exists locally (used for different purposes depending on type)
    const branchExistedLocally = await branchExists(branchName)

    // For non-PRs, throw error if branch exists
    // For PRs, we'll use this to determine if we need to reset later
    if (input.type !== 'pr' && branchExistedLocally) {
      throw new Error(
        `Cannot create worktree: branch '${branchName}' already exists. ` +
        `Use 'git branch -D ${branchName}' to delete it first if needed.`
      )
    }

    await this.gitWorktree.createWorktree({
      path: worktreePath,
      branch: branchName,
      createBranch: input.type !== 'pr', // PRs use existing branches
      ...(input.baseBranch && { baseBranch: input.baseBranch }),
    })

    // Reset PR branch to match remote exactly (if we created a new local branch)
    // Ports: bash script lines 689-713
    if (input.type === 'pr' && !branchExistedLocally) {
      logger.info('Resetting new PR branch to match remote exactly...')
      try {
        await executeGitCommand(['reset', '--hard', `origin/${branchName}`], { cwd: worktreePath })
        await executeGitCommand(['branch', '--set-upstream-to', `origin/${branchName}`], { cwd: worktreePath })
        logger.success('Successfully reset to match remote')
      } catch (error) {
        logger.warn(`Failed to reset to match remote: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    return worktreePath
  }

  /**
   * Setup environment for the hatchbox
   * Copies main .env file to worktree first, then sets/updates PORT variable
   */
  private async setupEnvironment(
    worktreePath: string,
    input: CreateHatchboxInput,
    basePort: number
  ): Promise<number> {
    const envFilePath = path.join(worktreePath, '.env')

    // First, copy main .env file to worktree (like bash script lines 715-725)
    try {
      const mainEnvPath = path.join(process.cwd(), '.env')
      await this.environment.copyEnvFile(mainEnvPath, envFilePath)
      logger.info('Copied main .env file to worktree')
    } catch (error) {
      // Handle gracefully if main .env doesn't exist
      logger.warn(`Warning: Failed to copy main .env file: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    // Then set/update the PORT variable in the copied file using configured base port
    const options: { basePort: number; issueNumber?: number; prNumber?: number; branchName?: string } = { basePort }

    if (input.type === 'issue') {
      options.issueNumber = input.identifier as number
    } else if (input.type === 'pr') {
      options.prNumber = input.identifier as number
    } else if (input.type === 'branch') {
      options.branchName = input.identifier as string
    }

    const port = this.environment.calculatePort(options)

    await this.environment.setEnvVar(envFilePath, 'PORT', String(port))
    return port
  }

  /**
   * Load environment variables from main .env file into process.env
   * Uses dotenv-flow to handle various .env file patterns
   */
  private loadMainEnvFile(): void {
    const result = loadEnvIntoProcess({ path: process.cwd() })

    if (result.error) {
      // Handle gracefully if .env files don't exist
      logger.warn(`Warning: Could not load .env files: ${result.error.message}`)
    } else {
      logger.info('Loaded environment variables using dotenv-flow')
      if (result.parsed && Object.keys(result.parsed).length > 0) {
        logger.debug(`Loaded ${Object.keys(result.parsed).length} environment variables`)
      }
    }
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
   * Base port: configurable via settings.capabilities.web.basePort (default 3000) + issue/PR number (or deterministic hash for branches)
   */
  private async calculatePort(input: CreateHatchboxInput): Promise<number> {
    // Load base port from settings
    const settingsData = await this.settings.loadSettings()
    const basePort = settingsData.capabilities?.web?.basePort ?? 3000

    if (input.type === 'issue' && typeof input.identifier === 'number') {
      return this.environment.calculatePort({ basePort, issueNumber: input.identifier })
    }

    if (input.type === 'pr' && typeof input.identifier === 'number') {
      return this.environment.calculatePort({ basePort, prNumber: input.identifier })
    }

    if (input.type === 'branch' && typeof input.identifier === 'string') {
      // Use deterministic hash for branch-based ports
      return this.environment.calculatePort({ basePort, branchName: input.identifier })
    }

    // Fallback: basePort only (shouldn't reach here with valid input)
    throw new Error(`Unknown input type: ${input.type}`)
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
  private async mapWorktreesToHatchboxes(worktrees: GitWorktree[]): Promise<Hatchbox[]> {
    return await Promise.all(worktrees.map(async (wt) => {
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
        port: await this.calculatePort({ type, identifier, originalInput: '' }),
        createdAt: new Date(),
        lastAccessed: new Date(),
      }
    }))
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
   * Includes environment setup and database branching for existing worktrees
   * Ports: handle_existing_worktree() from bash script lines 168-215
   */
  private async reuseHatchbox(
    worktree: GitWorktree,
    input: CreateHatchboxInput,
    githubData: Issue | PullRequest | null
  ): Promise<Hatchbox> {
    const worktreePath = worktree.path
    const branchName = worktree.branch

    // 1. Load main .env variables into process.env
    this.loadMainEnvFile()

    // 2. Detect capabilities (quick, no installation)
    const { capabilities, binEntries } = await this.capabilityDetector.detectCapabilities(worktreePath)

    // 3. Calculate port for existing worktree (but DON'T copy .env or set PORT)
    // The .env file was already set up when the worktree was first created
    // Load base port from settings
    const settingsData = await this.settings.loadSettings()
    const basePort = settingsData.capabilities?.web?.basePort ?? 3000

    let port = basePort
    if (capabilities.includes('web')) {
      port = await this.calculatePort(input)
    }

    // 4. Skip database branch creation for existing worktrees
    // The database branch should have been created when the worktree was first created
    // Matches bash script behavior: handle_existing_worktree() skips all setup
    logger.info('Database branch assumed to be already configured for existing worktree')
    const databaseBranch: string | undefined = undefined

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

    // 5. Launch components (same as new worktree)
    const enableClaude = input.options?.enableClaude !== false
    const enableCode = input.options?.enableCode !== false
    const enableDevServer = input.options?.enableDevServer !== false
    const oneShot = input.options?.oneShot ?? 'default'
    const setArguments = input.options?.setArguments
    const executablePath = input.options?.executablePath

    if (enableClaude || enableCode || enableDevServer) {
      logger.info('Launching workspace components...')
      const { HatchboxLauncher } = await import('./HatchboxLauncher.js')
      const { ClaudeContextManager } = await import('./ClaudeContextManager.js')

      // Create ClaudeContextManager with shared SettingsManager to ensure CLI overrides work
      const claudeContext = new ClaudeContextManager(undefined, undefined, this.settings)
      const launcher = new HatchboxLauncher(claudeContext)

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
        oneShot,
        ...(setArguments && { setArguments }),
        ...(executablePath && { executablePath }),
      })
    }

    // 6. Return hatchbox metadata
    const hatchbox: Hatchbox = {
      id: this.generateHatchboxId(input),
      path: worktreePath,
      branch: branchName,
      type: input.type,
      identifier: input.identifier,
      port,
      createdAt: new Date(), // We don't have actual creation date, use now
      lastAccessed: new Date(),
      ...(databaseBranch !== undefined && { databaseBranch }),
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
