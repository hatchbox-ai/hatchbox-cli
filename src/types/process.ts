/**
 * Information about a running process
 */
export interface ProcessInfo {
	/** Process ID */
	pid: number
	/** Process name (e.g., "node", "pnpm") */
	name: string
	/** Full command line */
	command: string
	/** Port the process is listening on */
	port: number
	/** Whether this appears to be a dev server */
	isDevServer: boolean
}

/**
 * Supported platform types
 */
export type Platform = 'darwin' | 'linux' | 'win32' | 'unsupported'
