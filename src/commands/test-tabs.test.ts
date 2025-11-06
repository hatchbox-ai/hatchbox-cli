import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TestTabsCommand } from './test-tabs.js'
import * as terminal from '../utils/terminal.js'
import * as loggerModule from '../utils/logger.js'

// Mock terminal utils
vi.mock('../utils/terminal.js', () => ({
  detectITerm2: vi.fn(),
  openDualTerminalWindow: vi.fn()
}))

// Mock logger
vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}))

describe('TestTabsCommand', () => {
  let command: TestTabsCommand

  beforeEach(() => {
    vi.clearAllMocks()
    command = new TestTabsCommand()
  })

  describe('execute', () => {
    it('should successfully open dual terminal tabs with iTerm2', async () => {
      // Mock iTerm2 detection
      vi.mocked(terminal.detectITerm2).mockResolvedValue(true)
      vi.mocked(terminal.openDualTerminalWindow).mockResolvedValue()

      // Execute command
      await command.execute()

      // Verify iTerm2 detection was called
      expect(terminal.detectITerm2).toHaveBeenCalledOnce()

      // Verify dual terminal window was opened
      expect(terminal.openDualTerminalWindow).toHaveBeenCalledOnce()

      // Verify the call parameters
      const callArgs = vi.mocked(terminal.openDualTerminalWindow).mock.calls[0]
      expect(callArgs).toHaveLength(2)

      // Check first tab options
      expect(callArgs[0]).toMatchObject({
        workspacePath: expect.any(String),
        command: expect.stringContaining('Tab 1 test'),
        backgroundColor: { r: 235, g: 235, b: 250 },
        title: 'Test Tab 1'
      })

      // Check second tab options
      expect(callArgs[1]).toMatchObject({
        workspacePath: expect.any(String),
        command: expect.stringContaining('Tab 2 test'),
        backgroundColor: { r: 235, g: 235, b: 250 },
        title: 'Test Tab 2'
      })

      // Verify success message
      expect(loggerModule.logger.success).toHaveBeenCalledWith(
        expect.stringContaining('opened successfully')
      )
    })

    it('should handle missing iTerm2 gracefully', async () => {
      // Mock iTerm2 not detected
      vi.mocked(terminal.detectITerm2).mockResolvedValue(false)
      vi.mocked(terminal.openDualTerminalWindow).mockResolvedValue()

      // Execute command
      await command.execute()

      // Verify warning was logged
      expect(loggerModule.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('iTerm2 not detected')
      )

      // Verify dual terminal window was still opened (fallback to Terminal.app)
      expect(terminal.openDualTerminalWindow).toHaveBeenCalledOnce()
    })

    it('should propagate errors from openDualTerminalWindow', async () => {
      // Mock iTerm2 detection
      vi.mocked(terminal.detectITerm2).mockResolvedValue(true)

      // Mock terminal opening failure
      const testError = new Error('Failed to open terminal')
      vi.mocked(terminal.openDualTerminalWindow).mockRejectedValue(testError)

      // Execute command and expect error
      await expect(command.execute()).rejects.toThrow('Failed to open terminal')

      // Verify error was logged
      expect(loggerModule.logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Test failed')
      )
    })

    it('should use current working directory for both tabs', async () => {
      const originalCwd = process.cwd()

      vi.mocked(terminal.detectITerm2).mockResolvedValue(true)
      vi.mocked(terminal.openDualTerminalWindow).mockResolvedValue()

      await command.execute()

      const callArgs = vi.mocked(terminal.openDualTerminalWindow).mock.calls[0]

      // Both tabs should use current working directory
      expect(callArgs[0].workspacePath).toBe(originalCwd)
      expect(callArgs[1].workspacePath).toBe(originalCwd)
    })

    it('should use the same background color for both tabs', async () => {
      vi.mocked(terminal.detectITerm2).mockResolvedValue(true)
      vi.mocked(terminal.openDualTerminalWindow).mockResolvedValue()

      await command.execute()

      const callArgs = vi.mocked(terminal.openDualTerminalWindow).mock.calls[0]

      // Both tabs should have the same background color (8-bit RGB: 0-255)
      expect(callArgs[0].backgroundColor).toEqual({ r: 235, g: 235, b: 250 })
      expect(callArgs[1].backgroundColor).toEqual({ r: 235, g: 235, b: 250 })
    })
  })
})
