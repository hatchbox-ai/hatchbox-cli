import { dirname, join } from 'path'
import { existsSync, lstatSync } from 'fs'

export type InstallationMethod = 'global' | 'local' | 'linked' | 'unknown'

/**
 * Detect how hatchbox-ai is installed
 * - global: npm install -g (in global node_modules)
 * - local: Running from source directory (has src/ sibling to dist/)
 * - linked: npm link (symlinked executable)
 * - unknown: Cannot determine
 */
export function detectInstallationMethod(scriptPath: string): InstallationMethod {
  try {
    // Check if the script is a symlink (npm link creates symlinks)
    try {
      const stats = lstatSync(scriptPath)
      if (stats.isSymbolicLink()) {
        return 'linked'
      }
    } catch {
      // If we can't stat it, continue to other checks
    }

    // Check if running from source directory
    // If the file is at dist/cli.js, check if src/ exists as a sibling
    if (scriptPath.includes('/dist/') || scriptPath.includes('\\dist\\')) {
      const distDir = dirname(scriptPath) // dist/
      const projectRoot = dirname(distDir) // project root
      const srcDir = join(projectRoot, 'src')
      const packageJsonPath = join(projectRoot, 'package.json')

      // If src/ and package.json exist in parent, we're running from source
      if (existsSync(srcDir) && existsSync(packageJsonPath)) {
        return 'local'
      }
    }

    // Check if in global node_modules
    // Global installs are typically in:
    // - /usr/local/lib/node_modules/ (macOS/Linux)
    // - ~/.nvm/versions/node/*/lib/node_modules/ (NVM)
    // - C:\Users\*\AppData\Roaming\npm\node_modules\ (Windows)
    // - /opt/homebrew/lib/node_modules (Homebrew on Apple Silicon)
    const globalPatterns = [
      '/lib/node_modules/',
      '/.nvm/versions/node/',
      '/AppData/Roaming/npm/node_modules/',
      '/.local/lib/node_modules/',
    ]

    const normalizedPath = scriptPath.replace(/\\/g, '/')
    for (const pattern of globalPatterns) {
      if (normalizedPath.includes(pattern)) {
        return 'global'
      }
    }

    return 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * Determine if update notifications should be shown
 * Returns true only for global installations
 */
export function shouldShowUpdateNotification(method: InstallationMethod): boolean {
  return method === 'global'
}
