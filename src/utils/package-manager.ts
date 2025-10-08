import { execa, type ExecaError } from 'execa'
import { logger } from './logger.js'

export type PackageManager = 'pnpm' | 'npm' | 'yarn'

/**
 * Detect which package manager is available
 */
export async function detectPackageManager(): Promise<PackageManager | null> {
  const managers: PackageManager[] = ['pnpm', 'npm', 'yarn']

  for (const manager of managers) {
    try {
      await execa(manager, ['--version'])
      return manager
    } catch {
      // Continue to next manager
    }
  }

  return null
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
  const packageManager = await detectPackageManager()

  if (!packageManager) {
    throw new Error('No package manager found (pnpm, npm, or yarn)')
  }

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
 */
export async function runScript(
  scriptName: string,
  cwd: string,
  args: string[] = []
): Promise<void> {
  const packageManager = await detectPackageManager()

  if (!packageManager) {
    throw new Error('No package manager found (pnpm, npm, or yarn)')
  }

  const command = packageManager === 'npm' ? ['run', scriptName] : [scriptName]

  try {
    await execa(packageManager, [...command, ...args], {
      cwd,
      stdio: 'inherit',
      timeout: 600000,  // 10 minute timeout for scripts
    })
  } catch (error) {
    const execaError = error as ExecaError
    const stderr = execaError.stderr ?? execaError.message ?? 'Unknown error'
    throw new Error(`Failed to run script '${scriptName}': ${stderr}`)
  }
}
