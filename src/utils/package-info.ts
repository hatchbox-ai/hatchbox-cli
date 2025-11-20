import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

/**
 * Package information from package.json
 */
export interface PackageInfo {
  name: string
  version: string
  description: string
  [key: string]: unknown
}

/**
 * Get package.json information
 *
 * @param scriptPath - Optional path to use for finding package.json (defaults to current file location)
 * @returns Parsed package.json contents
 * @throws Error if package.json cannot be read or parsed
 */
export function getPackageInfo(scriptPath?: string): PackageInfo {
  try {
    // Determine the base path to use
    let basePath: string
    if (scriptPath) {
      basePath = scriptPath
    } else {
      // Use import.meta.url to get the current file path
      const __filename = fileURLToPath(import.meta.url)
      basePath = __filename
    }

    // Navigate from current file to package.json
    // The compiled CLI runs from dist/cli.js, so we need dist/../package.json (one level up)
    const __dirname = dirname(basePath)
    const packageJsonPath = join(__dirname, '..', 'package.json')

    // Read and parse package.json
    const packageJsonContent = readFileSync(packageJsonPath, 'utf8')
    const packageJson = JSON.parse(packageJsonContent) as PackageInfo

    return packageJson
  } catch (error) {
    throw new Error(
      `Failed to read package.json: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}
