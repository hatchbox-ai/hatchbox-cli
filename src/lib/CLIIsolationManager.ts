import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import { runScript } from '../utils/package-manager.js'
import { readPackageJson, hasScript } from '../utils/package-json.js'
import { logger } from '../utils/logger.js'

export class CLIIsolationManager {
  private readonly iloomBinDir: string

  constructor() {
    this.iloomBinDir = path.join(os.homedir(), '.iloom', 'bin')
  }

  /**
   * Setup CLI isolation for a worktree
   * - Build the project
   * - Create versioned symlinks
   * - Check PATH configuration
   * @param worktreePath Path to the worktree
   * @param identifier Issue/PR number or branch identifier
   * @param binEntries Bin entries from package.json
   * @returns Array of created symlink names
   */
  async setupCLIIsolation(
    worktreePath: string,
    identifier: string | number,
    binEntries: Record<string, string>
  ): Promise<string[]> {
    // 1. Build the project
    await this.buildProject(worktreePath)

    // 2. Verify bin targets exist and are executable
    await this.verifyBinTargets(worktreePath, binEntries)

    // 3. Create ~/.iloom/bin if needed
    await fs.ensureDir(this.iloomBinDir)

    // 4. Create versioned symlinks
    const symlinkNames = await this.createVersionedSymlinks(
      worktreePath,
      identifier,
      binEntries
    )

    // 5. Check PATH and provide instructions if needed
    await this.ensureIloomBinInPath()

    return symlinkNames
  }

  /**
   * Build the project using package.json build script
   * @param worktreePath Path to the worktree
   */
  private async buildProject(worktreePath: string): Promise<void> {
    const pkgJson = await readPackageJson(worktreePath)

    if (!hasScript(pkgJson, 'build')) {
      logger.warn('No build script found in package.json - skipping build')
      return
    }

    logger.info('Building CLI tool...')
    await runScript('build', worktreePath)
    logger.success('Build completed')
  }

  /**
   * Verify bin targets exist and are executable
   * @param worktreePath Path to the worktree
   * @param binEntries Bin entries from package.json
   */
  private async verifyBinTargets(
    worktreePath: string,
    binEntries: Record<string, string>
  ): Promise<void> {
    for (const binPath of Object.values(binEntries)) {
      const targetPath = path.resolve(worktreePath, binPath)

      // Check if file exists
      const exists = await fs.pathExists(targetPath)
      if (!exists) {
        throw new Error(`Bin target does not exist: ${targetPath}`)
      }

      // Check if file is executable
      try {
        await fs.access(targetPath, fs.constants.X_OK)
      } catch {
        // File is not executable, but that's okay - symlink will work anyway
        // The shebang in the file will determine how it's executed
      }
    }
  }

  /**
   * Create versioned symlinks in ~/.iloom/bin
   * @param worktreePath Path to the worktree
   * @param identifier Issue/PR number or branch identifier
   * @param binEntries Bin entries from package.json
   * @returns Array of created symlink names
   */
  private async createVersionedSymlinks(
    worktreePath: string,
    identifier: string | number,
    binEntries: Record<string, string>
  ): Promise<string[]> {
    const symlinkNames: string[] = []

    for (const [binName, binPath] of Object.entries(binEntries)) {
      const versionedName = `${binName}-${identifier}`
      const targetPath = path.resolve(worktreePath, binPath)
      const symlinkPath = path.join(this.iloomBinDir, versionedName)

      // Create symlink
      await fs.symlink(targetPath, symlinkPath)

      logger.success(`CLI available: ${versionedName}`)
      symlinkNames.push(versionedName)
    }

    return symlinkNames
  }

  /**
   * Check if ~/.iloom/bin is in PATH and provide setup instructions
   */
  private async ensureIloomBinInPath(): Promise<void> {
    const currentPath = process.env.PATH ?? ''
    if (currentPath.includes('.iloom/bin')) {
      return // Already configured
    }

    // Detect shell and RC file
    const shell = this.detectShell()
    const rcFile = this.getShellRcFile(shell)

    // Print setup instructions
    logger.warn('\n⚠️  One-time PATH setup required:')
    logger.warn(`   Add to ${rcFile}:`)
    logger.warn(`   export PATH="$HOME/.iloom/bin:$PATH"`)
    logger.warn(`   Then run: source ${rcFile}\n`)
  }

  /**
   * Detect current shell
   * @returns Shell name (zsh, bash, fish, etc.)
   */
  private detectShell(): string {
    const shell = process.env.SHELL ?? ''
    return shell.split('/').pop() ?? 'bash'
  }

  /**
   * Get RC file path for shell
   * @param shell Shell name
   * @returns RC file path
   */
  private getShellRcFile(shell: string): string {
    const rcFiles: Record<string, string> = {
      zsh: '~/.zshrc',
      bash: '~/.bashrc',
      fish: '~/.config/fish/config.fish'
    }
    return rcFiles[shell] ?? '~/.bashrc'
  }

  /**
   * Cleanup versioned CLI executables for a specific identifier
   * Removes all symlinks matching the pattern: {binName}-{identifier}
   *
   * @param identifier - Issue/PR number or branch identifier
   * @returns Array of removed symlink names
   */
  async cleanupVersionedExecutables(identifier: string | number): Promise<string[]> {
    const removed: string[] = []

    try {
      const files = await fs.readdir(this.iloomBinDir)

      for (const file of files) {
        if (this.matchesIdentifier(file, identifier)) {
          const symlinkPath = path.join(this.iloomBinDir, file)

          try {
            await fs.unlink(symlinkPath)
            removed.push(file)
          } catch (error) {
            // Silently skip if symlink already gone (ENOENT)
            const isEnoent = error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'
            if (isEnoent) {
              removed.push(file)
              continue
            }

            // Log warning for other errors but continue cleanup
            logger.warn(
              `Failed to remove symlink ${file}: ${error instanceof Error ? error.message : 'Unknown error'}`
            )
          }
        }
      }
    } catch (error) {
      // Handle missing bin directory gracefully
      const isEnoent = error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'
      if (isEnoent) {
        logger.warn('No CLI executables directory found - nothing to cleanup')
        return []
      }

      // Re-throw unexpected errors
      throw error
    }

    if (removed.length > 0) {
      logger.success(`Removed CLI executables: ${removed.join(', ')}`)
    }

    return removed
  }

  /**
   * Find orphaned symlinks in ~/.iloom/bin
   * Returns symlinks that point to non-existent targets
   *
   * @returns Array of orphaned symlink information
   */
  async findOrphanedSymlinks(): Promise<Array<{ name: string; path: string; brokenTarget: string }>> {
    const orphaned: Array<{ name: string; path: string; brokenTarget: string }> = []

    try {
      const files = await fs.readdir(this.iloomBinDir)

      for (const file of files) {
        const symlinkPath = path.join(this.iloomBinDir, file)

        try {
          const stats = await fs.lstat(symlinkPath)

          if (stats.isSymbolicLink()) {
            const target = await fs.readlink(symlinkPath)

            // Check if target exists
            try {
              await fs.access(target)
            } catch {
              // Target doesn't exist - this is an orphaned symlink
              orphaned.push({
                name: file,
                path: symlinkPath,
                brokenTarget: target
              })
            }
          }
        } catch (error) {
          // Skip files we can't read
          logger.warn(
            `Failed to check symlink ${file}: ${error instanceof Error ? error.message : 'Unknown error'}`
          )
        }
      }
    } catch (error) {
      // Handle missing bin directory
      const isEnoent = error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'
      if (isEnoent) {
        return []
      }

      // Re-throw unexpected errors
      throw error
    }

    return orphaned
  }

  /**
   * Cleanup all orphaned symlinks
   * Removes symlinks that point to non-existent targets
   *
   * @returns Number of symlinks removed
   */
  async cleanupOrphanedSymlinks(): Promise<number> {
    const orphaned = await this.findOrphanedSymlinks()
    let removedCount = 0

    for (const symlink of orphaned) {
      try {
        await fs.unlink(symlink.path)
        removedCount++
        logger.success(`Removed orphaned symlink: ${symlink.name}`)
      } catch (error) {
        logger.warn(
          `Failed to remove orphaned symlink ${symlink.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      }
    }

    return removedCount
  }

  /**
   * Check if a filename matches the versioned pattern for an identifier
   * Pattern: {binName}-{identifier}
   *
   * @param fileName - Name of the file to check
   * @param identifier - Issue/PR number or branch identifier
   * @returns True if the filename matches the pattern
   */
  private matchesIdentifier(fileName: string, identifier: string | number): boolean {
    const suffix = `-${identifier}`
    return fileName.endsWith(suffix)
  }
}
