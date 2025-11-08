import os from 'os'
import path from 'path'
import fs from 'fs-extra'
import { execa } from 'execa'
import chalk from 'chalk'
import { logger } from './logger.js'

export interface UpdateCheckCache {
  lastCheck: number // timestamp
  latestVersion: string
}

export interface UpdateCheckResult {
  currentVersion: string
  latestVersion: string
  updateAvailable: boolean
}

export class UpdateNotifier {
  private cacheFilePath: string
  private currentVersion: string
  private packageName: string
  private cacheDurationMs: number = 24 * 60 * 60 * 1000 // 24 hours

  constructor(currentVersion: string, packageName: string) {
    this.currentVersion = currentVersion
    this.packageName = packageName
    // Cross-platform cache directory
    const configDir = path.join(os.homedir(), '.config', 'hatchbox-ai')
    this.cacheFilePath = path.join(configDir, 'update-check.json')
  }

  /**
   * Check for updates, respecting 24hr cache
   * Returns UpdateCheckResult or null if check failed/not needed
   */
  async checkForUpdates(): Promise<UpdateCheckResult | null> {
    try {
      // Check cache first
      const cached = await this.getCachedCheck()
      if (cached !== null) {
        return {
          currentVersion: this.currentVersion,
          latestVersion: cached.latestVersion,
          updateAvailable: this.isNewerVersion(this.currentVersion, cached.latestVersion),
        }
      }

      // Query npm registry
      const latestVersion = await this.fetchLatestVersion()
      if (latestVersion === null) {
        return null
      }

      // Save to cache
      await this.saveCacheFile(latestVersion)

      return {
        currentVersion: this.currentVersion,
        latestVersion,
        updateAvailable: this.isNewerVersion(this.currentVersion, latestVersion),
      }
    } catch {
      // Handle all errors gracefully - update check should never break user experience
      return null
    }
  }

  /**
   * Read cache file, return null if stale or missing
   */
  private async getCachedCheck(): Promise<UpdateCheckCache | null> {
    try {
      if (!fs.existsSync(this.cacheFilePath)) {
        return null
      }

      const content = await fs.readFile(this.cacheFilePath, 'utf8')
      const cache = JSON.parse(content) as UpdateCheckCache

      // Check if cache is still fresh (< 24 hours)
      const now = Date.now()
      if (now - cache.lastCheck < this.cacheDurationMs) {
        return cache
      }

      return null
    } catch {
      // If cache is corrupted or unreadable, treat as missing
      return null
    }
  }

  /**
   * Save successful check to cache
   */
  private async saveCacheFile(latestVersion: string): Promise<void> {
    try {
      // Ensure cache directory exists
      const configDir = path.dirname(this.cacheFilePath)
      await fs.ensureDir(configDir)

      // Write cache file
      const cache: UpdateCheckCache = {
        lastCheck: Date.now(),
        latestVersion,
      }
      await fs.writeFile(this.cacheFilePath, JSON.stringify(cache, null, 2), 'utf8')
    } catch {
      // Log debug message but don't throw - cache write failure shouldn't break anything
      logger.debug(`Failed to save update check cache to ${this.cacheFilePath}`)
    }
  }

  /**
   * Display update notification to user
   */
  displayUpdateNotification(result: UpdateCheckResult): void {
    if (result.updateAvailable) {
      // Simple, clear update notification
      /* eslint-disable no-console */
      console.log('')
      console.log('  ' + chalk.bold(`Update available: ${result.currentVersion} → ${result.latestVersion}`))
      console.log('  ' + chalk.bold('Run: hb update'))
      console.log('')
      /* eslint-enable no-console */
    }
  }

  /**
   * Query npm registry for latest version
   */
  private async fetchLatestVersion(): Promise<string | null> {
    try {
      const { stdout } = await execa('npm', ['view', this.packageName, 'version'], {
        timeout: 5000,
      })
      return stdout.trim()
    } catch {
      // Network errors, timeouts, npm not available, or package not found
      return null
    }
  }

  /**
   * Compare semver versions
   * Returns true if latest > current
   */
  private isNewerVersion(current: string, latest: string): boolean {
    // Simple version comparison: split by dots and compare numerically
    try {
      const currentParts = current.split('.').map(p => parseInt(p, 10))
      const latestParts = latest.split('.').map(p => parseInt(p, 10))

      for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
        const curr = currentParts[i] ?? 0
        const next = latestParts[i] ?? 0

        if (next > curr) return true
        if (next < curr) return false
      }

      return false
    } catch {
      // If parsing fails, assume no update
      return false
    }
  }
}

/**
 * Main entry point for update check
 * Call from CLI postAction hook
 */
export async function checkAndNotifyUpdate(
  currentVersion: string,
  packageName: string,
  installMethod: string
): Promise<void> {
  try {
    // Only check for global installations
    if (installMethod !== 'global') {
      return
    }

    const notifier = new UpdateNotifier(currentVersion, packageName)
    const result = await notifier.checkForUpdates()

    if (result !== null) {
      notifier.displayUpdateNotification(result)
    }
  } catch {
    // All errors handled internally - this should never throw
  }
}
