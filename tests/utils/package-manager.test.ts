import { describe, it, expect, vi, beforeEach } from 'vitest'
import { execa, type ExecaReturnValue } from 'execa'
import { detectPackageManager, installDependencies, runScript } from '../../src/utils/package-manager.js'
import { logger } from '../../src/utils/logger.js'
import fs from 'fs-extra'

type MockExecaReturn = Partial<ExecaReturnValue<string>>

vi.mock('execa')
vi.mock('fs-extra')
vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }
}))

describe('package-manager utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('detectPackageManager', () => {
    it('should detect pnpm when available', async () => {
      vi.mocked(execa).mockResolvedValueOnce({ stdout: '8.0.0' } as MockExecaReturn)

      const result = await detectPackageManager()

      expect(result).toBe('pnpm')
      expect(execa).toHaveBeenCalledWith('pnpm', ['--version'])
    })

    it('should fallback to npm when pnpm not available', async () => {
      vi.mocked(execa)
        .mockRejectedValueOnce(new Error('pnpm not found'))
        .mockResolvedValueOnce({ stdout: '9.0.0' } as MockExecaReturn)

      const result = await detectPackageManager()

      expect(result).toBe('npm')
      expect(execa).toHaveBeenCalledWith('npm', ['--version'])
    })

    it('should fallback to yarn when pnpm and npm not available', async () => {
      vi.mocked(execa)
        .mockRejectedValueOnce(new Error('pnpm not found'))
        .mockRejectedValueOnce(new Error('npm not found'))
        .mockResolvedValueOnce({ stdout: '1.22.0' } as MockExecaReturn)

      const result = await detectPackageManager()

      expect(result).toBe('yarn')
      expect(execa).toHaveBeenCalledWith('yarn', ['--version'])
    })

    it('should default to npm when no package manager found', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(false)
      vi.mocked(execa).mockRejectedValue(new Error('not found'))

      const result = await detectPackageManager()

      expect(result).toBe('npm')
    })
  })

  describe('detectPackageManager with packageManager field', () => {
    it('should detect pnpm from packageManager field in package.json', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        name: 'test-project',
        packageManager: 'pnpm@8.15.0'
      }))

      const result = await detectPackageManager('/test/path')

      expect(result).toBe('pnpm')
      expect(fs.pathExists).toHaveBeenCalledWith('/test/path/package.json')
      expect(fs.readFile).toHaveBeenCalledWith('/test/path/package.json', 'utf-8')
      expect(execa).not.toHaveBeenCalled()
    })

    it('should detect npm from packageManager field with version', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        name: 'test-project',
        packageManager: 'npm@9.0.0'
      }))

      const result = await detectPackageManager('/test/path')

      expect(result).toBe('npm')
    })

    it('should detect yarn from packageManager field', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        name: 'test-project',
        packageManager: 'yarn@1.22.0'
      }))

      const result = await detectPackageManager('/test/path')

      expect(result).toBe('yarn')
    })

    it('should parse packageManager field with integrity hash (corepack format)', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        name: 'test-project',
        packageManager: 'pnpm@10.16.1+sha512.0e155aa2629db8672b49e8475da6226aa4bdea85fdcdfdc15350874946d4f3c91faaf64cbdc4a5d1ab8002f473d5c3fcedcd197989cf0390f9badd3c04678706'
      }))

      const result = await detectPackageManager('/test/path')

      expect(result).toBe('pnpm')
    })

    it('should fall back to lock files when packageManager field has invalid manager', async () => {
      vi.mocked(fs.pathExists)
        .mockResolvedValueOnce(true)  // package.json exists
        .mockResolvedValueOnce(true)  // pnpm-lock.yaml exists
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        name: 'test-project',
        packageManager: 'bower@1.0.0'
      }))

      const result = await detectPackageManager('/test/path')

      expect(result).toBe('pnpm')
      expect(fs.pathExists).toHaveBeenCalledWith('/test/path/pnpm-lock.yaml')
    })

    it('should fall back to lock files when packageManager field is missing', async () => {
      vi.mocked(fs.pathExists)
        .mockResolvedValueOnce(true)  // package.json exists
        .mockResolvedValueOnce(false)  // pnpm-lock.yaml doesn't exist
        .mockResolvedValueOnce(false)  // package-lock.json doesn't exist
        .mockResolvedValueOnce(true)   // yarn.lock exists
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        name: 'test-project'
      }))

      const result = await detectPackageManager('/test/path')

      expect(result).toBe('yarn')
    })

    it('should handle malformed package.json gracefully', async () => {
      vi.mocked(fs.pathExists)
        .mockResolvedValueOnce(true)  // package.json exists
        .mockResolvedValueOnce(false)  // pnpm-lock.yaml doesn't exist
        .mockResolvedValueOnce(true)   // package-lock.json exists
      vi.mocked(fs.readFile).mockResolvedValue('{ invalid json }')

      const result = await detectPackageManager('/test/path')

      expect(result).toBe('npm')
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Could not read packageManager from package.json'))
    })

    it('should handle package.json read errors gracefully', async () => {
      vi.mocked(fs.pathExists)
        .mockResolvedValueOnce(true)  // package.json exists
        .mockResolvedValueOnce(true)  // pnpm-lock.yaml exists
      vi.mocked(fs.readFile).mockRejectedValue(new Error('EACCES: permission denied'))

      const result = await detectPackageManager('/test/path')

      expect(result).toBe('pnpm')
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Could not read packageManager from package.json'))
    })

    it('should handle non-existent package.json gracefully', async () => {
      vi.mocked(fs.pathExists)
        .mockResolvedValueOnce(false)  // package.json doesn't exist
        .mockResolvedValueOnce(true)   // pnpm-lock.yaml exists

      const result = await detectPackageManager('/test/path')

      expect(result).toBe('pnpm')
      expect(fs.readFile).not.toHaveBeenCalled()
    })
  })

  describe('detectPackageManager with lock files', () => {
    beforeEach(() => {
      // Mock package.json not existing or not having packageManager field
      vi.mocked(fs.pathExists).mockImplementation(async (path: string) => {
        if (path.toString().endsWith('package.json')) {
          return false
        }
        return false
      })
    })

    it('should detect pnpm from pnpm-lock.yaml', async () => {
      vi.mocked(fs.pathExists).mockImplementation(async (path: string) => {
        if (path.toString().endsWith('pnpm-lock.yaml')) {
          return true
        }
        return false
      })

      const result = await detectPackageManager('/test/path')

      expect(result).toBe('pnpm')
      expect(fs.pathExists).toHaveBeenCalledWith('/test/path/pnpm-lock.yaml')
    })

    it('should detect npm from package-lock.json', async () => {
      vi.mocked(fs.pathExists).mockImplementation(async (path: string) => {
        if (path.toString().endsWith('package-lock.json')) {
          return true
        }
        return false
      })

      const result = await detectPackageManager('/test/path')

      expect(result).toBe('npm')
      expect(fs.pathExists).toHaveBeenCalledWith('/test/path/package-lock.json')
    })

    it('should detect yarn from yarn.lock', async () => {
      vi.mocked(fs.pathExists).mockImplementation(async (path: string) => {
        if (path.toString().endsWith('yarn.lock')) {
          return true
        }
        return false
      })

      const result = await detectPackageManager('/test/path')

      expect(result).toBe('yarn')
      expect(fs.pathExists).toHaveBeenCalledWith('/test/path/yarn.lock')
    })

    it('should prioritize pnpm-lock.yaml over package-lock.json when both exist', async () => {
      vi.mocked(fs.pathExists).mockImplementation(async (path: string) => {
        const pathStr = path.toString()
        if (pathStr.endsWith('pnpm-lock.yaml') || pathStr.endsWith('package-lock.json')) {
          return true
        }
        return false
      })

      const result = await detectPackageManager('/test/path')

      expect(result).toBe('pnpm')
    })

    it('should prioritize package-lock.json over yarn.lock when both exist', async () => {
      vi.mocked(fs.pathExists).mockImplementation(async (path: string) => {
        const pathStr = path.toString()
        if (pathStr.endsWith('package-lock.json') || pathStr.endsWith('yarn.lock')) {
          return true
        }
        return false
      })

      const result = await detectPackageManager('/test/path')

      expect(result).toBe('npm')
    })

    it('should fall back to installed managers when no lock files exist', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(false)
      vi.mocked(execa).mockResolvedValueOnce({ stdout: '8.0.0' } as MockExecaReturn)

      const result = await detectPackageManager('/test/path')

      expect(result).toBe('pnpm')
      expect(execa).toHaveBeenCalledWith('pnpm', ['--version'])
    })
  })

  describe('detectPackageManager with cwd parameter', () => {
    it('should use default cwd when not provided', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(false)
      vi.mocked(execa).mockResolvedValueOnce({ stdout: '8.0.0' } as MockExecaReturn)

      const result = await detectPackageManager()

      expect(result).toBe('pnpm')
      const expectedPath = `${process.cwd()}/package.json`
      expect(fs.pathExists).toHaveBeenCalledWith(expectedPath)
    })

    it('should use provided cwd for package.json lookup', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        name: 'test-project',
        packageManager: 'yarn@1.22.0'
      }))

      const result = await detectPackageManager('/custom/path')

      expect(result).toBe('yarn')
      expect(fs.pathExists).toHaveBeenCalledWith('/custom/path/package.json')
      expect(fs.readFile).toHaveBeenCalledWith('/custom/path/package.json', 'utf-8')
    })

    it('should use provided cwd for lock file lookup', async () => {
      vi.mocked(fs.pathExists).mockImplementation(async (path: string) => {
        return path.toString() === '/custom/path/pnpm-lock.yaml'
      })

      const result = await detectPackageManager('/custom/path')

      expect(result).toBe('pnpm')
      expect(fs.pathExists).toHaveBeenCalledWith('/custom/path/pnpm-lock.yaml')
    })

    it('should handle non-existent directory gracefully', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(false)
      vi.mocked(execa).mockRejectedValue(new Error('not found'))

      const result = await detectPackageManager('/does/not/exist')

      expect(result).toBe('npm')
    })
  })

  describe('detectPackageManager default fallback', () => {
    it('should default to npm when all detection methods fail', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(false)
      vi.mocked(execa).mockRejectedValue(new Error('not found'))

      const result = await detectPackageManager('/test/path')

      expect(result).toBe('npm')
      expect(logger.debug).toHaveBeenCalledWith('No package manager detected, defaulting to npm')
    })
  })

  describe('installDependencies', () => {
    it('should install with pnpm --frozen-lockfile', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        packageManager: 'pnpm@8.0.0'
      }))
      vi.mocked(execa).mockResolvedValueOnce({ stdout: '' } as MockExecaReturn)  // install command

      await installDependencies('/test/path', true)

      expect(execa).toHaveBeenCalledWith(
        'pnpm',
        ['install', '--frozen-lockfile'],
        expect.objectContaining({
          cwd: '/test/path',
          stdio: 'inherit',
          timeout: 300000
        })
      )
      expect(logger.success).toHaveBeenCalledWith('Dependencies installed successfully')
    })

    it('should install with pnpm without frozen lockfile', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        packageManager: 'pnpm@8.0.0'
      }))
      vi.mocked(execa).mockResolvedValueOnce({ stdout: '' } as MockExecaReturn)  // install command

      await installDependencies('/test/path', false)

      expect(execa).toHaveBeenCalledWith(
        'pnpm',
        ['install'],
        expect.objectContaining({
          cwd: '/test/path'
        })
      )
    })

    it('should use npm ci for frozen installs', async () => {
      vi.mocked(fs.pathExists).mockImplementation(async (path: string) => {
        const pathStr = path.toString()
        return pathStr.endsWith('package-lock.json') || pathStr.endsWith('package.json')
      })
      vi.mocked(execa).mockResolvedValueOnce({ stdout: '' } as MockExecaReturn)  // install command

      await installDependencies('/test/path', true)

      expect(execa).toHaveBeenCalledWith(
        'npm',
        ['ci'],
        expect.objectContaining({
          cwd: '/test/path'
        })
      )
    })

    it('should use npm install for non-frozen installs', async () => {
      vi.mocked(fs.pathExists).mockImplementation(async (path: string) => {
        const pathStr = path.toString()
        return pathStr.endsWith('package-lock.json') || pathStr.endsWith('package.json')
      })
      vi.mocked(execa).mockResolvedValueOnce({ stdout: '' } as MockExecaReturn)  // install command

      await installDependencies('/test/path', false)

      expect(execa).toHaveBeenCalledWith(
        'npm',
        ['install'],
        expect.objectContaining({
          cwd: '/test/path'
        })
      )
    })

    it('should use yarn with frozen lockfile', async () => {
      vi.mocked(fs.pathExists).mockImplementation(async (path: string) => {
        const pathStr = path.toString()
        return pathStr.endsWith('yarn.lock') || pathStr.endsWith('package.json')
      })
      vi.mocked(execa).mockResolvedValueOnce({ stdout: '' } as MockExecaReturn)  // install command

      await installDependencies('/test/path', true)

      expect(execa).toHaveBeenCalledWith(
        'yarn',
        ['install', '--frozen-lockfile'],
        expect.objectContaining({
          cwd: '/test/path'
        })
      )
    })

    it('should throw error when install fails', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        packageManager: 'pnpm@8.0.0'
      }))
      vi.mocked(execa).mockRejectedValueOnce({
        stderr: 'Lockfile is out of date',
        message: 'Command failed'
      })

      await expect(installDependencies('/test/path')).rejects.toThrow(
        'Failed to install dependencies: Lockfile is out of date'
      )
    })

    it('should handle install error with only message', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        packageManager: 'pnpm@8.0.0'
      }))
      vi.mocked(execa).mockRejectedValueOnce({
        message: 'Install failed'
      })

      await expect(installDependencies('/test/path')).rejects.toThrow(
        'Failed to install dependencies: Install failed'
      )
    })

    it('should use package manager from worktree package.json', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        packageManager: 'yarn@1.22.0'
      }))
      vi.mocked(execa).mockResolvedValueOnce({ stdout: '' } as MockExecaReturn)

      await installDependencies('/worktree/path', true)

      expect(execa).toHaveBeenCalledWith(
        'yarn',
        ['install', '--frozen-lockfile'],
        expect.objectContaining({
          cwd: '/worktree/path'
        })
      )
    })

    it('should detect different package manager than system default', async () => {
      // Mock npm project (has package-lock.json)
      vi.mocked(fs.pathExists).mockImplementation(async (path: string) => {
        const pathStr = path.toString()
        return pathStr.endsWith('package-lock.json') || pathStr.endsWith('package.json')
      })
      vi.mocked(execa).mockResolvedValueOnce({ stdout: '' } as MockExecaReturn)

      await installDependencies('/worktree/path', true)

      // Should use npm ci, not pnpm (even if pnpm is installed)
      expect(execa).toHaveBeenCalledWith(
        'npm',
        ['ci'],
        expect.objectContaining({
          cwd: '/worktree/path'
        })
      )
    })

    it('should skip installation when package.json does not exist', async () => {
      vi.mocked(fs.pathExists).mockImplementation(async (path: string) => {
        // Only return false for package.json
        if (path.toString().endsWith('package.json')) {
          return false
        }
        return false
      })

      await installDependencies('/test/path', true)

      // Should not call execa to run install
      expect(execa).not.toHaveBeenCalled()
      expect(logger.debug).toHaveBeenCalledWith('Skipping dependency installation - no package.json found')
    })
  })

  describe('runScript', () => {
    it('should run script with pnpm', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        packageManager: 'pnpm@8.0.0'
      }))
      vi.mocked(execa).mockResolvedValueOnce({ stdout: '' } as MockExecaReturn)  // run command

      await runScript('test', '/test/path', ['--coverage'])

      expect(execa).toHaveBeenCalledWith(
        'pnpm',
        ['test', '--coverage'],
        expect.objectContaining({
          cwd: '/test/path',
          stdio: 'inherit',
          timeout: 600000
        })
      )
    })

    it('should run script with pnpm without additional args', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        packageManager: 'pnpm@8.0.0'
      }))
      vi.mocked(execa).mockResolvedValueOnce({ stdout: '' } as MockExecaReturn)  // run command

      await runScript('build', '/test/path')

      expect(execa).toHaveBeenCalledWith(
        'pnpm',
        ['build'],
        expect.objectContaining({
          cwd: '/test/path'
        })
      )
    })

    it('should use npm run for npm', async () => {
      vi.mocked(fs.pathExists).mockImplementation(async (path: string) => {
        return path.toString().endsWith('package-lock.json')
      })
      vi.mocked(execa).mockResolvedValueOnce({ stdout: '' } as MockExecaReturn)  // run command

      await runScript('build', '/test/path')

      expect(execa).toHaveBeenCalledWith(
        'npm',
        ['run', 'build'],
        expect.objectContaining({
          cwd: '/test/path'
        })
      )
    })

    it('should use yarn for yarn', async () => {
      vi.mocked(fs.pathExists).mockImplementation(async (path: string) => {
        return path.toString().endsWith('yarn.lock')
      })
      vi.mocked(execa).mockResolvedValueOnce({ stdout: '' } as MockExecaReturn)  // run command

      await runScript('test', '/test/path')

      expect(execa).toHaveBeenCalledWith(
        'yarn',
        ['test'],
        expect.objectContaining({
          cwd: '/test/path'
        })
      )
    })

    it('should throw error when script fails', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        packageManager: 'pnpm@8.0.0'
      }))
      vi.mocked(execa).mockRejectedValueOnce({
        stderr: 'Test failed',
        message: 'Command failed'
      })

      await expect(runScript('test', '/test/path')).rejects.toThrow(
        "Failed to run script 'test': Test failed"
      )
    })

    it('should handle script error with only message', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        packageManager: 'pnpm@8.0.0'
      }))
      vi.mocked(execa).mockRejectedValueOnce({
        message: 'Script not found'
      })

      await expect(runScript('unknown', '/test/path')).rejects.toThrow(
        "Failed to run script 'unknown': Script not found"
      )
    })

    it('should use package manager from script directory', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        packageManager: 'pnpm@8.0.0'
      }))
      vi.mocked(execa).mockResolvedValueOnce({ stdout: '' } as MockExecaReturn)

      await runScript('test', '/script/path')

      expect(execa).toHaveBeenCalledWith(
        'pnpm',
        ['test'],
        expect.objectContaining({
          cwd: '/script/path'
        })
      )
    })

    it('should set CI=true in environment when running scripts', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true)
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        packageManager: 'pnpm@8.0.0'
      }))
      vi.mocked(execa).mockResolvedValueOnce({ stdout: '' } as MockExecaReturn)

      await runScript('test', '/test/path')

      expect(execa).toHaveBeenCalledWith(
        'pnpm',
        ['test'],
        expect.objectContaining({
          cwd: '/test/path',
          env: expect.objectContaining({
            CI: 'true'
          })
        })
      )
    })
  })
})
