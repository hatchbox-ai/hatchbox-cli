// Lines 1-5: Imports
import chalk, { Chalk } from 'chalk'

// Lines 7-17: Type definitions
export interface LoggerOptions {
  prefix?: string
  timestamp?: boolean
  silent?: boolean
  forceColor?: boolean | undefined | null
  debug?: boolean
}

export interface Logger {
  info: (message: string, ...args: unknown[]) => void
  success: (message: string, ...args: unknown[]) => void
  warn: (message: string, ...args: unknown[]) => void
  error: (message: string, ...args: unknown[]) => void
  debug: (message: string, ...args: unknown[]) => void
  setDebug: (enabled: boolean) => void
  isDebugEnabled: () => boolean
}

// Lines 19-29: Stream-specific chalk instances
const stdoutChalk = new Chalk({ level: chalk.level })
const stderrChalk = new Chalk({ level: chalk.level })

// Lines 31-45: Helper functions
function formatMessage(message: string, ...args: unknown[]): string {
  // Convert args to strings and append to message
  const formattedArgs = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  )
  return formattedArgs.length > 0 ? `${message} ${formattedArgs.join(' ')}` : message
}

function formatWithEmoji(message: string, emoji: string, colorFn: (str: string) => string): string {
  if (message.trim()) {
    return colorFn(`${emoji} ${message}`)
  } else {
    return ''
  }
}

let globalDebugEnabled = false

// Lines 47-96: Main logger implementation
/* eslint-disable no-console */
export const logger: Logger = {
  info: (message: string, ...args: unknown[]): void => {
    const formatted = formatMessage(message, ...args)
    const output = formatWithEmoji(formatted, '🗂️ ', stdoutChalk.blue)
    console.log(output)
  },

  success: (message: string, ...args: unknown[]): void => {
    const formatted = formatMessage(message, ...args)
    const output = formatWithEmoji(formatted, '✅', stdoutChalk.green)
    console.log(output)
  },

  warn: (message: string, ...args: unknown[]): void => {
    const formatted = formatMessage(message, ...args)
    const output = formatWithEmoji(formatted, '⚠️ ', stderrChalk.yellow)
    console.error(output)
  },

  error: (message: string, ...args: unknown[]): void => {
    const formatted = formatMessage(message, ...args)
    const output = formatWithEmoji(formatted, '❌', stderrChalk.red)
    console.error(output)
  },

  debug: (message: string, ...args: unknown[]): void => {
    if (globalDebugEnabled) {
      const formatted = formatMessage(message, ...args)
      const output = formatWithEmoji(formatted, '🔍', stdoutChalk.gray)
      console.log(output)
    }
  },

  setDebug: (enabled: boolean): void => {
    globalDebugEnabled = enabled
  },

  isDebugEnabled: (): boolean => {
    return globalDebugEnabled
  }
}
/* eslint-enable no-console */

// Lines 98-145: Factory function for custom logger instances
export function createLogger(options: LoggerOptions = {}): Logger {
  const { prefix = '', timestamp = false, silent = false, forceColor, debug = globalDebugEnabled } = options

  // Local debug flag for this logger instance
  let localDebugEnabled = debug

  // Create chalk instances with forced color if needed
  const customStdoutChalk = forceColor !== undefined
    ? new Chalk({ level: forceColor ? 3 : 0 })
    : stdoutChalk
  const customStderrChalk = forceColor !== undefined
    ? new Chalk({ level: forceColor ? 3 : 0 })
    : stderrChalk

  const prefixStr = prefix ? `[${prefix}] ` : ''
  const getTimestamp = (): string => timestamp ? `[${new Date().toISOString()}] ` : ''

  if (silent) {
    // Return no-op logger when silent
    return {
      info: (): void => {},
      success: (): void => {},
      warn: (): void => {},
      error: (): void => {},
      debug: (): void => {},
      setDebug: (): void => {},
      isDebugEnabled: (): boolean => {
        return false
      }
    }
  }

  /* eslint-disable no-console */
  return {
    info: (message: string, ...args: unknown[]): void => {
      const formatted = formatMessage(message, ...args)
      const fullMessage = `${getTimestamp()}${prefixStr}${formatted}`
      const output = formatWithEmoji(fullMessage, '🗂️ ', customStdoutChalk.blue)
      console.log(output)
    },
    success: (message: string, ...args: unknown[]): void => {
      const formatted = formatMessage(message, ...args)
      const fullMessage = `${getTimestamp()}${prefixStr}${formatted}`
      const output = formatWithEmoji(fullMessage, '✅', customStdoutChalk.green)
      console.log(output)
    },
    warn: (message: string, ...args: unknown[]): void => {
      const formatted = formatMessage(message, ...args)
      const fullMessage = `${getTimestamp()}${prefixStr}${formatted}`
      const output = formatWithEmoji(fullMessage, '⚠️ ', customStderrChalk.yellow)
      console.error(output)
    },
    error: (message: string, ...args: unknown[]): void => {
      const formatted = formatMessage(message, ...args)
      const fullMessage = `${getTimestamp()}${prefixStr}${formatted}`
      const output = formatWithEmoji(fullMessage, '❌', customStderrChalk.red)
      console.error(output)
    },
    debug: (message: string, ...args: unknown[]): void => {
      if (localDebugEnabled) {
        const formatted = formatMessage(message, ...args)
        const fullMessage = `${getTimestamp()}${prefixStr}${formatted}`
        const output = formatWithEmoji(fullMessage, '🔍', customStdoutChalk.gray)
        console.log(output)
      }
    },
    setDebug: (enabled: boolean): void => {
      localDebugEnabled = enabled
    },
    isDebugEnabled: (): boolean => {
      return globalDebugEnabled
    }
  }
  /* eslint-enable no-console */
}

// Lines 147-148: Default export
export default logger
