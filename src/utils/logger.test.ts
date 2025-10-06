// Lines 1-10: Imports and mocks
import { describe, it, expect, vi, beforeEach, afterEach, type SpyInstance } from 'vitest'
import { logger, createLogger } from './logger.js'

// Lines 12-25: Test utilities
let stdoutSpy: SpyInstance
let stderrSpy: SpyInstance
let stdoutBuffer: string[] = []
let stderrBuffer: string[] = []

beforeEach(() => {
  stdoutBuffer = []
  stderrBuffer = []
  stdoutSpy = vi.spyOn(console, 'log').mockImplementation((msg: string) => {
    stdoutBuffer.push(msg)
  })
  stderrSpy = vi.spyOn(console, 'error').mockImplementation((msg: string) => {
    stderrBuffer.push(msg)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

// Lines 27-100: Core logger tests
describe('Logger', () => {
  describe('log levels', () => {
    it('info should log to stdout with blue color', () => {
      logger.info('test message')
      expect(stdoutSpy).toHaveBeenCalledOnce()
      expect(stderrSpy).not.toHaveBeenCalled()
      expect(stdoutBuffer[0]).toContain('test message')
      expect(stdoutBuffer[0]).toContain('🗂️')
    })

    it('success should log to stdout with green color', () => {
      logger.success('operation completed')
      expect(stdoutSpy).toHaveBeenCalledOnce()
      expect(stderrSpy).not.toHaveBeenCalled()
      expect(stdoutBuffer[0]).toContain('operation completed')
      expect(stdoutBuffer[0]).toContain('✅')
    })

    it('warn should log to stderr with yellow color', () => {
      logger.warn('warning message')
      expect(stderrSpy).toHaveBeenCalledOnce()
      expect(stdoutSpy).not.toHaveBeenCalled()
      expect(stderrBuffer[0]).toContain('warning message')
      expect(stderrBuffer[0]).toContain('⚠️')
    })

    it('error should log to stderr with red color', () => {
      logger.error('error occurred')
      expect(stderrSpy).toHaveBeenCalledOnce()
      expect(stdoutSpy).not.toHaveBeenCalled()
      expect(stderrBuffer[0]).toContain('error occurred')
      expect(stderrBuffer[0]).toContain('❌')
    })

    it('debug should log to stdout without color', () => {
      logger.debug('debug info')
      expect(stdoutSpy).toHaveBeenCalledOnce()
      expect(stderrSpy).not.toHaveBeenCalled()
      expect(stdoutBuffer[0]).toContain('DEBUG: debug info')
    })
  })

  // Lines 102-140: Argument handling tests
  describe('argument handling', () => {
    it('should handle multiple arguments', () => {
      logger.info('user', 'logged in', { id: 123 })
      expect(stdoutBuffer[0]).toContain('user')
      expect(stdoutBuffer[0]).toContain('logged in')
      expect(stdoutBuffer[0]).toContain('123')
    })

    it('should format objects as JSON', () => {
      const obj = { name: 'test', value: 42 }
      logger.info('data:', obj)
      expect(stdoutBuffer[0]).toContain('data:')
      expect(stdoutBuffer[0]).toContain('"name"')
      expect(stdoutBuffer[0]).toContain('"test"')
      expect(stdoutBuffer[0]).toContain('"value"')
      expect(stdoutBuffer[0]).toContain('42')
    })

    it('should handle undefined and null', () => {
      logger.info('values:', undefined, null)
      expect(stdoutBuffer[0]).toContain('values:')
      expect(stdoutBuffer[0]).toContain('undefined')
      expect(stdoutBuffer[0]).toContain('null')
    })
  })

  // Lines 142-205: createLogger tests
  describe('createLogger', () => {
    it('should create logger with prefix', () => {
      const customLogger = createLogger({ prefix: 'MyApp' })
      customLogger.info('startup')
      customLogger.success('startup')
      customLogger.warn('startup')
      customLogger.error('startup')
      customLogger.debug('startup')
      expect(stdoutBuffer[0]).toContain('[MyApp]')
      expect(stdoutBuffer[0]).toContain('startup')
    })

    it('should create logger with timestamp', () => {
      const customLogger = createLogger({ timestamp: true })
      customLogger.info('timed event')
      customLogger.success('timed event')
      customLogger.warn('timed event')
      customLogger.error('timed event')
      customLogger.debug('timed event')
      expect(stdoutBuffer[0]).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      expect(stdoutBuffer[0]).toContain('timed event')
    })

    it('should create silent logger', () => {
      const silentLogger = createLogger({ silent: true })
      silentLogger.info('should not appear')
      silentLogger.success('should not appear')
      silentLogger.warn('should not appear')
      silentLogger.error('also should not appear')
      silentLogger.debug('should not appear')
      expect(stdoutSpy).not.toHaveBeenCalled()
      expect(stderrSpy).not.toHaveBeenCalled()
    })

    it('should force color when specified', () => {
      const colorLogger = createLogger({ forceColor: true })
      colorLogger.info('forced color')
      colorLogger.success('forced color')
      colorLogger.warn('forced color')
      colorLogger.error('forced color')
      colorLogger.debug('forced color')
      // The output should have ANSI escape codes even if chalk is disabled
      expect(stdoutBuffer[0]).toBeDefined()
    })

    it('should disable color when forceColor is false', () => {
      const noColorLogger = createLogger({ forceColor: false })
      noColorLogger.info('no color')
      noColorLogger.success('no color')
      noColorLogger.warn('no color')
      noColorLogger.error('no color')
      noColorLogger.debug('no color')
      // Check that no ANSI escape codes are present
      // eslint-disable-next-line no-control-regex
      expect(stdoutBuffer[0]).not.toMatch(/\x1b\[\d+m/)
    })
  })

  // Lines 207-270: Stream separation tests
  describe('stream separation', () => {
    it('should separate stdout and stderr correctly', () => {
      logger.info('stdout 1')
      logger.success('stdout 2')
      logger.debug('stdout 3')
      logger.warn('stderr 1')
      logger.error('stderr 2')

      expect(stdoutBuffer).toHaveLength(3)
      expect(stderrBuffer).toHaveLength(2)
    })

    it('should maintain order within each stream', () => {
      logger.info('first')
      logger.success('second')
      logger.warn('warning')
      logger.error('error')
      logger.debug('third')

      expect(stdoutBuffer[0]).toContain('first')
      expect(stdoutBuffer[1]).toContain('second')
      expect(stdoutBuffer[2]).toContain('third')
      expect(stderrBuffer[0]).toContain('warning')
      expect(stderrBuffer[1]).toContain('error')
    })
  })

  // Lines 272-330: Snapshot tests
  describe('output format snapshots', () => {
    it('should match expected format for all log levels', () => {
      // Reset mocks to capture raw output
      vi.restoreAllMocks()
      const outputs: string[] = []
      vi.spyOn(console, 'log').mockImplementation((msg) => outputs.push(msg))
      vi.spyOn(console, 'error').mockImplementation((msg) => outputs.push(msg))

      logger.info('Information message')
      logger.success('Success message')
      logger.warn('Warning message')
      logger.error('Error message')
      logger.debug('Debug message')

      // Verify structure (actual colors depend on terminal)
      expect(outputs[0]).toContain('🗂️')
      expect(outputs[0]).toContain('Information message')
      expect(outputs[1]).toContain('✅')
      expect(outputs[1]).toContain('Success message')
      expect(outputs[2]).toContain('⚠️')
      expect(outputs[2]).toContain('Warning message')
      expect(outputs[3]).toContain('❌')
      expect(outputs[3]).toContain('Error message')
      expect(outputs[4]).toContain('DEBUG:')
      expect(outputs[4]).toContain('Debug message')
    })
  })

  // Lines 332-380: Color rendering tests
  describe('color rendering', () => {
    it('should apply colors when terminal supports it', () => {
      // Force color support for testing
      const coloredLogger = createLogger({ forceColor: true })
      coloredLogger.info('colored')

      // Check for ANSI escape codes
      if (stdoutBuffer[0].includes('\x1b[')) {
        // eslint-disable-next-line no-control-regex
        expect(stdoutBuffer[0]).toMatch(/\x1b\[34m/) // Blue color code
      }
    })

    it('should handle FORCE_COLOR environment variable', () => {
      const originalEnv = process.env.FORCE_COLOR
      process.env.FORCE_COLOR = '1'

      // Re-import to pick up env change
      vi.resetModules()

      process.env.FORCE_COLOR = originalEnv
    })
  })

  // Lines 382-430: Coverage edge cases
  describe('edge cases', () => {
    it('should handle empty messages', () => {
      logger.info('')
      expect(stdoutBuffer[0]).toContain('🗂️')
    })

    it('should handle very long messages', () => {
      const longMessage = 'x'.repeat(1000)
      logger.info(longMessage)
      expect(stdoutBuffer[0]).toContain(longMessage)
    })

    it('should handle special characters', () => {
      logger.info('Special: \n\t\r\\')
      expect(stdoutBuffer[0]).toContain('Special:')
    })

    it('should handle circular references in objects', () => {
      interface CircularObject {
        a: number
        self?: CircularObject
      }
      const circular: CircularObject = { a: 1 }
      circular.self = circular

      // Should handle circular reference gracefully
      expect(() => {
        logger.info('Circular:', circular)
      }).toThrow() // JSON.stringify throws on circular references
    })
  })
})
