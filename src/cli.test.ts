import { describe, it, expect } from 'vitest'
import { spawn } from 'child_process'

// Helper function to run CLI command and capture output
function runCLI(args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise(resolve => {
    const child = spawn('node', ['dist/cli.js', ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', data => {
      stdout += data.toString()
    })

    child.stderr.on('data', data => {
      stderr += data.toString()
    })

    child.on('close', code => {
      resolve({ stdout, stderr, code })
    })
  })
}

describe('CLI', () => {
  it('should show help when --help flag is provided', async () => {
    const { stdout, code } = await runCLI(['--help'])
    expect(code).toBe(0)
    expect(stdout).toContain('Usage: hatchbox')
    expect(stdout).toContain('AI-assisted workspace management')
  })

  it('should show version when --version flag is provided', async () => {
    const { stdout, code } = await runCLI(['--version'])
    expect(code).toBe(0)
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('should show available commands in help', async () => {
    const { stdout, code } = await runCLI(['--help'])
    expect(code).toBe(0)
    expect(stdout).toContain('start')
    expect(stdout).toContain('finish')
    expect(stdout).toContain('cleanup')
    expect(stdout).toContain('list')
    expect(stdout).toContain('switch')
  })

  it('should show command-specific help', async () => {
    const { stdout, code } = await runCLI(['start', '--help'])
    expect(code).toBe(0)
    expect(stdout).toContain('Create isolated workspace')
    expect(stdout).toContain('[identifier]') // Changed to optional format for interactive prompting
  })

  it('should handle invalid commands gracefully', async () => {
    const { stderr, code } = await runCLI(['invalid-command'])
    expect(code).not.toBe(0)
    expect(stderr).toContain("unknown command 'invalid-command'")
  })
})
