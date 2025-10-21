import { execa } from 'execa'

export type Platform = 'darwin' | 'linux' | 'win32'

/**
 * Detect the current platform
 * @returns Platform type
 * @throws Error if platform is unsupported
 */
export function detectPlatform(): Platform {
	const platform = process.platform

	if (platform === 'darwin' || platform === 'linux' || platform === 'win32') {
		return platform
	}

	throw new Error(
		`Unsupported platform: ${platform}. Browser opening is only supported on macOS, Linux, and Windows.`
	)
}

/**
 * Get the browser command for the given platform
 * @param platform - The platform type
 * @returns Command to open browser
 */
function getBrowserCommand(platform: Platform): { command: string; args: (url: string) => string[] } {
	switch (platform) {
		case 'darwin':
			return { command: 'open', args: (url) => [url] }
		case 'linux':
			return { command: 'xdg-open', args: (url) => [url] }
		case 'win32':
			return { command: 'cmd', args: (url) => ['/c', 'start', url] }
	}
}

/**
 * Open a URL in the default browser
 * @param url - The URL to open
 * @throws Error if browser fails to open
 */
export async function openBrowser(url: string): Promise<void> {
	try {
		const platform = detectPlatform()
		const { command, args } = getBrowserCommand(platform)
		await execa(command, args(url))
	} catch (error) {
		throw new Error(
			`Failed to open browser: ${error instanceof Error ? error.message : 'Unknown error'}`
		)
	}
}
