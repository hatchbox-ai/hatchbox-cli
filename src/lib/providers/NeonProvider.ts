import { execa, type ExecaError } from 'execa'
import type { DatabaseProvider } from '../../types/index.js'
import { createLogger } from '../../utils/logger.js'
import { promptConfirmation } from '../../utils/prompt.js'

const logger = createLogger({ prefix: '🗂️' })

interface NeonBranch {
  name: string
  id: string
  [key: string]: unknown
}

export interface NeonConfig {
  projectId: string
  parentBranch: string
}

/**
 * Validate Neon configuration
 * Checks that required configuration values are present
 */
export function validateNeonConfig(config: {
  projectId?: string
  parentBranch?: string
}): { valid: boolean; error?: string } {
  if (!config.projectId) {
    return {
      valid: false,
      error: 'NEON_PROJECT_ID is required',
    }
  }

  if (!config.parentBranch) {
    return {
      valid: false,
      error: 'NEON_PARENT_BRANCH is required',
    }
  }

  // Basic validation for project ID format (should start with appropriate prefix)
  if (!/^[a-zA-Z0-9-]+$/.test(config.projectId)) {
    return {
      valid: false,
      error: 'NEON_PROJECT_ID contains invalid characters',
    }
  }

  return { valid: true }
}

/**
 * Neon database provider implementation
 * Ports functionality from bash/utils/neon-utils.sh
 */
export class NeonProvider implements DatabaseProvider {
  constructor(private config: NeonConfig) {}

  /**
   * Execute a Neon CLI command and return stdout
   * Throws an error if the command fails
   */
  private async executeNeonCommand(args: string[]): Promise<string> {
    try {
      const result = await execa('neon', args, {
        timeout: 30000,
        encoding: 'utf8',
        stdio: 'pipe',
      })
      return result.stdout
    } catch (error) {
      const execaError = error as ExecaError
      const stderr = execaError.stderr ?? execaError.message ?? 'Unknown Neon CLI error'
      throw new Error(`Neon CLI command failed: ${stderr}`)
    }
  }

  /**
   * Check if neon CLI is available
   * Ports: check_neon_cli() from bash/utils/neon-utils.sh:18-23
   */
  async isCliAvailable(): Promise<boolean> {
    try {
      await execa('command', ['-v', 'neon'], {
        timeout: 5000,
        shell: true,
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * Check if user is authenticated with Neon CLI
   * Ports: check_neon_auth() from bash/utils/neon-utils.sh:25-36
   */
  async isAuthenticated(): Promise<boolean> {
    const cliAvailable = await this.isCliAvailable()
    if (!cliAvailable) {
      return false
    }

    try {
      await execa('neon', ['me'], {
        timeout: 10000,
        stdio: 'pipe',
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * Sanitize branch name for Neon (replace slashes with underscores)
   * Ports: sanitize_neon_branch_name() from bash/utils/neon-utils.sh:11-15
   */
  sanitizeBranchName(branchName: string): string {
    return branchName.replace(/\//g, '_')
  }

  /**
   * Extract endpoint ID from Neon connection string
   * Pattern matches: ep-abc-123 or ep-abc-123-pooler
   * Returns: ep-abc-123 (without -pooler suffix)
   * Used by: get_neon_branch_name() from bash/utils/neon-utils.sh:294
   */
  private extractEndpointId(connectionString: string): string | null {
    // First, extract the full host part between @ and first dot
    // Examples:
    //   @ep-abc123.us-east-1.neon.tech -> ep-abc123
    //   @ep-abc123-pooler.us-east-1.neon.tech -> ep-abc123-pooler
    const hostMatch = connectionString.match(/@(ep-[a-z0-9-]+)\./)
    if (!hostMatch?.[1]) {
      return null
    }

    const fullEndpoint = hostMatch[1]
    // Remove -pooler suffix if present
    return fullEndpoint.replace(/-pooler$/, '')
  }

  /**
   * List all branches in the Neon project
   * Ports: list_neon_branches() from bash/utils/neon-utils.sh:63-74
   */
  async listBranches(): Promise<string[]> {
    const output = await this.executeNeonCommand([
      'branches',
      'list',
      '--project-id',
      this.config.projectId,
      '--output',
      'json',
    ])

    const branches: NeonBranch[] = JSON.parse(output)
    return branches.map(branch => branch.name)
  }

  /**
   * Check if a branch exists
   * Ports: check_neon_branch_exists() from bash/utils/neon-utils.sh:38-61
   */
  async branchExists(name: string): Promise<boolean> {
    const branches = await this.listBranches()
    return branches.includes(name)
  }

  /**
   * Get connection string for a specific branch
   * Ports: get_neon_connection_string() from bash/utils/neon-utils.sh:76-90
   */
  async getConnectionString(branch: string): Promise<string> {
    const connectionString = await this.executeNeonCommand([
      'connection-string',
      '--branch',
      branch,
      '--project-id',
      this.config.projectId,
    ])
    return connectionString.trim()
  }

  /**
   * Find Vercel preview database branch
   * Checks for both patterns: preview/<branch> and preview_<sanitized-branch>
   * Ports: find_preview_database_branch() from bash/utils/neon-utils.sh:92-124
   */
  async findPreviewBranch(branchName: string): Promise<string | null> {
    // Check for exact preview branch match with slash pattern
    const slashPattern = `preview/${branchName}`
    if (await this.branchExists(slashPattern)) {
      logger.info(`Found Vercel preview database: ${slashPattern}`)
      return slashPattern
    }

    // Check for underscore pattern variation
    const sanitized = this.sanitizeBranchName(branchName)
    const underscorePattern = `preview_${sanitized}`
    if (await this.branchExists(underscorePattern)) {
      logger.info(`Found Vercel preview database: ${underscorePattern}`)
      return underscorePattern
    }

    return null
  }

  /**
   * Create a new database branch
   * ALWAYS checks for Vercel preview database first
   * Returns connection string for the branch
   * Ports: create_neon_database_branch() from bash/utils/neon-utils.sh:126-187
   */
  async createBranch(name: string, fromBranch?: string): Promise<string> {
    // Always check for existing Vercel preview database first (lines 149-158)
    const previewBranch = await this.findPreviewBranch(name)
    if (previewBranch) {
      const connectionString = await this.getConnectionString(previewBranch)
      logger.success(`Using existing Vercel preview database: ${previewBranch}`)
      return connectionString
    }

    // Sanitize branch name for Neon (replace slashes with underscores)
    const sanitizedName = this.sanitizeBranchName(name)
    const parentBranch = fromBranch ?? this.config.parentBranch

    logger.info('Creating Neon database branch...')
    logger.info(`  Source branch: ${parentBranch}`)
    logger.info(`  New branch: ${sanitizedName}`)

    // Create the database branch
    await this.executeNeonCommand([
      'branches',
      'create',
      '--name',
      sanitizedName,
      '--parent',
      parentBranch,
      '--project-id',
      this.config.projectId,
    ])

    logger.success('Database branch created successfully')

    // Get the connection string for the new branch
    logger.info('Getting connection string for new database branch...')
    const connectionString = await this.getConnectionString(sanitizedName)

    return connectionString
  }

  /**
   * Delete a database branch
   * Includes preview database protection with user confirmation
   * Ports: delete_neon_database_branch() from bash/utils/neon-utils.sh:204-259
   */
  async deleteBranch(name: string, isPreview: boolean = false): Promise<void> {
    // Sanitize branch name for Neon
    const sanitizedName = this.sanitizeBranchName(name)

    // For preview contexts, check for preview databases first
    if (isPreview) {
      const previewBranch = await this.findPreviewBranch(name)
      if (previewBranch) {
        logger.warn(`Found Vercel preview database: ${previewBranch}`)
        logger.warn('Preview databases are managed by Vercel and will be cleaned up automatically')
        logger.warn('Manual deletion may interfere with Vercel\'s preview deployments')

        const confirmed = await promptConfirmation(
          'Delete preview database anyway?',
          false
        )

        if (confirmed) {
          logger.info(`Deleting Vercel preview database: ${previewBranch}`)
          await this.executeNeonCommand([
            'branches',
            'delete',
            previewBranch,
            '--project-id',
            this.config.projectId,
          ])
          logger.success('Preview database deleted successfully')
          return
        } else {
          logger.info('Skipping preview database deletion')
          return
        }
      }
      // If no preview database found, fall through to check regular branch
    }

    // Check for regular branch
    logger.info(`Checking for Neon database branch: ${sanitizedName}`)
    const exists = await this.branchExists(sanitizedName)
    if (!exists) {
      logger.info(`No database branch found for '${name}'`)
      return
    }

    logger.info(`Deleting Neon database branch: ${sanitizedName}`)
    await this.executeNeonCommand([
      'branches',
      'delete',
      sanitizedName,
      '--project-id',
      this.config.projectId,
    ])
    logger.success('Database branch deleted successfully')
  }

  /**
   * Get branch name from endpoint ID (reverse lookup)
   * Searches all branches to find one with matching endpoint
   * Ports: get_neon_branch_name() from bash/utils/neon-utils.sh:262-308
   */
  async getBranchNameFromEndpoint(endpointId: string): Promise<string | null> {
    const branches = await this.listBranches()

    for (const branch of branches) {
      try {
        const connectionString = await this.getConnectionString(branch)
        const branchEndpointId = this.extractEndpointId(connectionString)

        if (branchEndpointId === endpointId) {
          return branch
        }
      } catch {
        // Skip branches that fail to get connection string
        continue
      }
    }

    return null
  }
}
