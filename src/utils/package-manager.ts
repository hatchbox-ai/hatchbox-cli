import { execa, type ExecaError } from 'execa'
import { logger } from './logger.js'
import fs from 'fs-extra'
import path from 'path'

export type PackageManager = 'pnpm' | 'npm' | 'yarn'

/**
 * Validate if a string is a supported package manager
 */
function isValidPackageManager(manager: string): manager is PackageManager {
  return manager === 'pnpm' || manager === 'npm' || manager === 'yarn'
}

/**
 * Detect which package manager to use for a project
 * Checks in order:
 * 1. packageManager field in package.json (Node.js standard)
 * 2. Lock files (pnpm-lock.yaml, package-lock.json, yarn.lock)
 * 3. Installed package managers (system-wide check)
 * 4. Defaults to npm if all detection fails
 *
 * @param cwd Working directory to detect package manager in (defaults to process.cwd())
 * @returns The detected package manager, or 'npm' as default
 */
export async function detectPackageManager(cwd: string = process.cwd()): Promise<PackageManager> {
  // 1. Check packageManager field in package.json
  try {
    const packageJsonPath = path.join(cwd, 'package.json')
    if (await fs.pathExists(packageJsonPath)) {
      const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8')
      const packageJson = JSON.parse(packageJsonContent)

      if (packageJson.packageManager) {
        // Parse "pnpm@8.15.0" or "pnpm@10.16.1+sha512..." -> "pnpm"
        const manager = packageJson.packageManager.split('@')[0]
        if (isValidPackageManager(manager)) {
          logger.debug(`Detected package manager from package.json: ${manager}`)
          return manager
        }
      }
    }
  } catch (error) {
    // If package.json doesn't exist, is malformed, or unreadable, continue to next detection method
    logger.debug(`Could not read packageManager from package.json: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }

  // 2. Check lock files (priority: pnpm > npm > yarn)
  const lockFiles: Array<{ file: string; manager: PackageManager }> = [
    { file: 'pnpm-lock.yaml', manager: 'pnpm' },
    { file: 'package-lock.json', manager: 'npm' },
    { file: 'yarn.lock', manager: 'yarn' },
  ]

  for (const { file, manager } of lockFiles) {
    if (await fs.pathExists(path.join(cwd, file))) {
      logger.debug(`Detected package manager from lock file ${file}: ${manager}`)
      return manager
    }
  }

  // 3. Check installed package managers (original behavior)
  const managers: PackageManager[] = ['pnpm', 'npm', 'yarn']
  for (const manager of managers) {
    try {
      await execa(manager, ['--version'])
      logger.debug(`Detected installed package manager: ${manager}`)
      return manager
    } catch {
      // Continue to next manager
    }
  }

  // 4. Default to npm (always available in Node.js environments)
  logger.debug('No package manager detected, defaulting to npm')
  return 'npm'
}

/**
 * Install dependencies using the detected package manager
 * @param cwd Working directory to run install in
 * @param frozen Whether to use frozen lockfile (for production installs)
 * @returns true if installation succeeded, throws Error on failure
 */
export async function installDependencies(
  cwd: string,
  frozen: boolean = true
): Promise<void> {
  // Check if package.json exists before attempting installation
  if (!cwd) {
    logger.debug('Skipping dependency installation - no working directory provided')
    return
  }

  const pkgPath = path.join(cwd, 'package.json')
  if (!(await fs.pathExists(pkgPath))) {
    logger.debug('Skipping dependency installation - no package.json found')
    return
  }

  const packageManager = await detectPackageManager(cwd)

  logger.info(`Installing dependencies with ${packageManager}...`)

  const args: string[] = ['install']

  // Add frozen lockfile flag based on package manager
  if (frozen) {
    switch (packageManager) {
      case 'pnpm':
        args.push('--frozen-lockfile')
        break
      case 'yarn':
        args.push('--frozen-lockfile')
        break
      case 'npm':
        args.shift()  // Remove 'install'
        args.push('ci')  // npm ci is equivalent to frozen lockfile
        break
    }
  }

  try {
    await execa(packageManager, args, {
      cwd,
      stdio: 'inherit',  // Show output to user
      timeout: 300000,   // 5 minute timeout for install
    })

    logger.success('Dependencies installed successfully')
  } catch (error) {
    const execaError = error as ExecaError
    const stderr = execaError.stderr ?? execaError.message ?? 'Unknown error'
    throw new Error(`Failed to install dependencies: ${stderr}`)
  }
}

/**
 * Run a package.json script
 * @param scriptName The script name from package.json
 * @param cwd Working directory
 * @param args Additional arguments to pass to the script
 * @param options Execution options
 */
export async function runScript(
  scriptName: string,
  cwd: string,
  args: string[] = [],
  options: { quiet?: boolean } = {}
): Promise<void> {
  const packageManager = await detectPackageManager(cwd)

  const command = packageManager === 'npm' ? ['run', scriptName] : [scriptName]

  try {
    await execa(packageManager, [...command, ...args], {
      cwd,
      stdio: options.quiet ? 'pipe' : 'inherit',
      timeout: 600000,  // 10 minute timeout for scripts
    })
  } catch (error) {
    const execaError = error as ExecaError
    const stderr = execaError.stderr ?? execaError.message ?? 'Unknown error'
    throw new Error(`Failed to run script '${scriptName}': ${stderr}`)
  }
}
