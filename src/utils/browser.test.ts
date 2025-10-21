import { describe, it, expect, vi, beforeEach } from 'vitest'
import { openBrowser, detectPlatform } from './browser.js'
import { execa } from 'execa'

// Mock execa
vi.mock('execa')

describe('browser utilities', () => {
	describe('detectPlatform', () => {
		it('should return "darwin" for macOS', () => {
			const originalPlatform = process.platform
			Object.defineProperty(process, 'platform', {
				value: 'darwin',
				configurable: true,
			})

			expect(detectPlatform()).toBe('darwin')

			// Restore
			Object.defineProperty(process, 'platform', {
				value: originalPlatform,
				configurable: true,
			})
		})

		it('should return "linux" for Linux', () => {
			const originalPlatform = process.platform
			Object.defineProperty(process, 'platform', {
				value: 'linux',
				configurable: true,
			})

			expect(detectPlatform()).toBe('linux')

			// Restore
			Object.defineProperty(process, 'platform', {
				value: originalPlatform,
				configurable: true,
			})
		})

		it('should return "win32" for Windows', () => {
			const originalPlatform = process.platform
			Object.defineProperty(process, 'platform', {
				value: 'win32',
				configurable: true,
			})

			expect(detectPlatform()).toBe('win32')

			// Restore
			Object.defineProperty(process, 'platform', {
				value: originalPlatform,
				configurable: true,
			})
		})

		it('should throw error for unsupported platforms', () => {
			const originalPlatform = process.platform
			Object.defineProperty(process, 'platform', {
				value: 'freebsd',
				configurable: true,
			})

			expect(() => detectPlatform()).toThrow('Unsupported platform')
			expect(() => detectPlatform()).toThrow('freebsd')

			// Restore
			Object.defineProperty(process, 'platform', {
				value: originalPlatform,
				configurable: true,
			})
		})
	})

	describe('openBrowser', () => {
		beforeEach(() => {
			vi.clearAllMocks()
		})

		it('should open browser on macOS using "open"', async () => {
			const originalPlatform = process.platform
			Object.defineProperty(process, 'platform', {
				value: 'darwin',
				configurable: true,
			})

			const url = 'http://localhost:3045'
			await openBrowser(url)

			expect(execa).toHaveBeenCalledWith('open', [url])

			// Restore
			Object.defineProperty(process, 'platform', {
				value: originalPlatform,
				configurable: true,
			})
		})

		it('should open browser on Linux using "xdg-open"', async () => {
			const originalPlatform = process.platform
			Object.defineProperty(process, 'platform', {
				value: 'linux',
				configurable: true,
			})

			const url = 'http://localhost:3045'
			await openBrowser(url)

			expect(execa).toHaveBeenCalledWith('xdg-open', [url])

			// Restore
			Object.defineProperty(process, 'platform', {
				value: originalPlatform,
				configurable: true,
			})
		})

		it('should open browser on Windows using "start"', async () => {
			const originalPlatform = process.platform
			Object.defineProperty(process, 'platform', {
				value: 'win32',
				configurable: true,
			})

			const url = 'http://localhost:3045'
			await openBrowser(url)

			expect(execa).toHaveBeenCalledWith('cmd', ['/c', 'start', url])

			// Restore
			Object.defineProperty(process, 'platform', {
				value: originalPlatform,
				configurable: true,
			})
		})

		it('should throw error on unsupported platform', async () => {
			const originalPlatform = process.platform
			Object.defineProperty(process, 'platform', {
				value: 'freebsd',
				configurable: true,
			})

			await expect(openBrowser('http://localhost:3045')).rejects.toThrow(
				'Unsupported platform'
			)

			// Restore
			Object.defineProperty(process, 'platform', {
				value: originalPlatform,
				configurable: true,
			})
		})

		it('should construct correct URL', async () => {
			const originalPlatform = process.platform
			Object.defineProperty(process, 'platform', {
				value: 'darwin',
				configurable: true,
			})

			const url = 'http://localhost:3087'
			await openBrowser(url)

			expect(execa).toHaveBeenCalledWith('open', [url])

			// Restore
			Object.defineProperty(process, 'platform', {
				value: originalPlatform,
				configurable: true,
			})
		})

		it('should handle execa errors gracefully', async () => {
			const originalPlatform = process.platform
			Object.defineProperty(process, 'platform', {
				value: 'darwin',
				configurable: true,
			})

			const mockError = new Error('Command not found')
			vi.mocked(execa).mockRejectedValueOnce(mockError)

			await expect(openBrowser('http://localhost:3045')).rejects.toThrow(
				'Failed to open browser'
			)

			// Restore
			Object.defineProperty(process, 'platform', {
				value: originalPlatform,
				configurable: true,
			})
		})
	})
})
