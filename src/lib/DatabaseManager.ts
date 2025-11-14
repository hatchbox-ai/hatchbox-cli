import type { DatabaseProvider } from '../types/index.js'
import { EnvironmentManager } from './EnvironmentManager.js'
import { createLogger } from '../utils/logger.js'

const logger = createLogger({ prefix: '🗂️' })

/**
 * Database Manager - orchestrates database operations with conditional execution
 * Ports functionality from bash scripts with guard conditions:
 *   1. Database provider must be properly configured (provider.isConfigured())
 *   2. The worktree's .env file must contain the configured database URL variable (default: DATABASE_URL)
 *
 * This ensures database branching only occurs for projects that actually use databases
 */
export class DatabaseManager {
  constructor(
    private provider: DatabaseProvider,
    private environment: EnvironmentManager,
    private databaseUrlEnvVarName: string = 'DATABASE_URL'
  ) {
    // Debug: Show which database URL variable name is configured
    if (databaseUrlEnvVarName !== 'DATABASE_URL') {
      logger.debug(`🔧 DatabaseManager configured with custom variable: ${databaseUrlEnvVarName}`)
    } else {
      logger.debug('🔧 DatabaseManager using default variable: DATABASE_URL')
    }
  }

  /**
   * Get the configured database URL environment variable name
   */
  getConfiguredVariableName(): string {
    return this.databaseUrlEnvVarName
  }

  /**
   * Check if database branching should be used
   * Requires BOTH conditions:
   *   1. Database provider is properly configured (checked via provider.isConfigured())
   *   2. .env file contains the configured database URL variable
   */
  async shouldUseDatabaseBranching(envFilePath: string): Promise<boolean> {
    // Check for provider configuration
    if (!this.provider.isConfigured()) {
      logger.debug('Skipping database branching: Database provider not configured')
      return false
    }

    // Check if .env has the configured database URL variable
    const hasDatabaseUrl = await this.hasDatabaseUrlInEnv(envFilePath)
    if (!hasDatabaseUrl) {
      logger.debug(
        'Skipping database branching: configured database URL variable not found in .env file'
      )
      return false
    }

    return true
  }

  /**
   * Create database branch only if configured
   * Returns connection string if branch was created, null if skipped
   *
   * @param branchName - Name of the branch to create
   * @param envFilePath - Path to .env file for configuration checks
   * @param cwd - Optional working directory to run commands from
   */
  async createBranchIfConfigured(
    branchName: string,
    envFilePath: string,
    cwd?: string
  ): Promise<string | null> {
    // Guard condition: check if database branching should be used
    if (!(await this.shouldUseDatabaseBranching(envFilePath))) {
      return null
    }

    // Check CLI availability and authentication
    if (!(await this.provider.isCliAvailable())) {
      logger.warn('Skipping database branch creation: Neon CLI not available')
      logger.warn('Install with: npm install -g neonctl')
      return null
    }

    try {
      const isAuth = await this.provider.isAuthenticated(cwd)
      if (!isAuth) {
        logger.warn('Skipping database branch creation: Not authenticated with Neon CLI')
        logger.warn('Run: neon auth')
        return null
      }
    } catch (error) {
      // Authentication check failed with an unexpected error - surface it
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`Database authentication check failed: ${errorMessage}`)
      throw error
    }

    try {
      // Create the branch (which checks for preview first)
      const connectionString = await this.provider.createBranch(branchName, undefined, cwd)
      logger.success(`Database branch ready: ${this.provider.sanitizeBranchName(branchName)}`)
      return connectionString
    } catch (error) {
      logger.error(
        `Failed to create database branch: ${error instanceof Error ? error.message : String(error)}`
      )
      throw error
    }
  }

  /**
   * Delete database branch only if configured
   * Returns result object indicating what happened
   *
   * @param branchName - Name of the branch to delete
   * @param shouldCleanup - Boolean indicating if database cleanup should be performed (pre-fetched config)
   * @param isPreview - Whether this is a preview database branch
   * @param cwd - Optional working directory to run commands from (prevents issues with deleted directories)
   */
  async deleteBranchIfConfigured(
    branchName: string,
    shouldCleanup: boolean,
    isPreview: boolean = false,
    cwd?: string
  ): Promise<import('../types/index.js').DatabaseDeletionResult> {
    // If shouldCleanup is explicitly false, skip immediately
    if (shouldCleanup === false) {
      return {
        success: true,
        deleted: false,
        notFound: true,  // Treat "not configured" as "nothing to delete"
        branchName
      }
    }

    // If shouldCleanup is explicitly true, validate provider configuration
    if (!this.provider.isConfigured()) {
      logger.debug('Skipping database branch deletion: Database provider not configured')
      return {
        success: true,
        deleted: false,
        notFound: true,
        branchName
      }
    }

    // Check CLI availability and authentication
    if (!(await this.provider.isCliAvailable())) {
      logger.info('Skipping database branch deletion: CLI tool not available')
      return {
        success: false,
        deleted: false,
        notFound: true,
        error: "CLI tool not available",
        branchName
      }
    }

    try {
      const isAuth = await this.provider.isAuthenticated(cwd)
      if (!isAuth) {
        logger.warn('Skipping database branch deletion: Not authenticated with DB Provider')
        return {
          success: false,
          deleted: false,
          notFound: false,
          error: "Not authenticated with DB Provider",
          branchName
        }
      }
    } catch (error) {
      // Authentication check failed with an unexpected error - surface it
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`Database authentication check failed: ${errorMessage}`)
      return {
        success: false,
        deleted: false,
        notFound: false,
        error: `Authentication check failed: ${errorMessage}`,
        branchName
      }
    }

    try {
      // Call provider and return its result directly
      const result = await this.provider.deleteBranch(branchName, isPreview, cwd)
      return result
    } catch (error) {
      // Unexpected error (shouldn't happen since provider returns result object)
      logger.warn(
        `Unexpected error in database deletion: ${error instanceof Error ? error.message : String(error)}`
      )
      return {
        success: false,
        deleted: false,
        notFound: false,
        error: error instanceof Error ? error.message : String(error),
        branchName
      }
    }
  }

  /**
   * Check if .env has the configured database URL variable
   * CRITICAL: If user explicitly configured a custom variable name (not default),
   * throw an error if it's missing from .env
   */
  private async hasDatabaseUrlInEnv(envFilePath: string): Promise<boolean> {
    try {
      const envMap = await this.environment.readEnvFile(envFilePath)

      // Debug: Show what we're looking for
      if (this.databaseUrlEnvVarName !== 'DATABASE_URL') {
        logger.debug(`Looking for custom database URL variable: ${this.databaseUrlEnvVarName}`)
      } else {
        logger.debug('Looking for default database URL variable: DATABASE_URL')
      }

      // Check configured variable first
      if (envMap.has(this.databaseUrlEnvVarName)) {
        if (this.databaseUrlEnvVarName !== 'DATABASE_URL') {
          logger.debug(`✅ Found custom database URL variable: ${this.databaseUrlEnvVarName}`)
        } else {
          logger.debug(`✅ Found default database URL variable: DATABASE_URL`)
        }
        return true
      }

      // If user explicitly configured a custom variable name (not the default)
      // and it's missing, throw an error
      if (this.databaseUrlEnvVarName !== 'DATABASE_URL') {
        logger.debug(`❌ Custom database URL variable '${this.databaseUrlEnvVarName}' not found in .env file`)
        throw new Error(
          `Configured database URL environment variable '${this.databaseUrlEnvVarName}' not found in .env file. ` +
          `Please add it to your .env file or update your iloom configuration.`
        )
      }

      // Fall back to DATABASE_URL when using default configuration
      const hasDefaultVar = envMap.has('DATABASE_URL')
      if (hasDefaultVar) {
        logger.debug('✅ Found fallback DATABASE_URL variable')
      } else {
        logger.debug('❌ No DATABASE_URL variable found in .env file')
      }
      return hasDefaultVar
    } catch (error) {
      // Re-throw configuration errors
      if (error instanceof Error && error.message.includes('not found in .env')) {
        throw error
      }
      // Return false for file read errors
      return false
    }
  }
}
