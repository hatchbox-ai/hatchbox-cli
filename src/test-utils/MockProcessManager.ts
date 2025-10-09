import { vi } from 'vitest'
import type { ProcessInfo } from '../types/process.js'

/**
 * Mock factory for ProcessManager
 */
export class MockProcessManager {
	private processInfoMap = new Map<number, ProcessInfo | null>()

	setupPort(port: number, processInfo: ProcessInfo | null): void {
		this.processInfoMap.set(port, processInfo)
	}

	setupDevServer(port: number, pid: number, name: string = 'node'): void {
		this.processInfoMap.set(port, {
			pid,
			name,
			command: 'node /app/.next/server.js',
			port,
			isDevServer: true,
		})
	}

	setupNonDevServer(port: number, pid: number, name: string = 'postgres'): void {
		this.processInfoMap.set(port, {
			pid,
			name,
			command: 'postgres: postgres hatchbox [local] idle',
			port,
			isDevServer: false,
		})
	}

	mockDetectDevServer(): ReturnType<typeof vi.fn> {
		return vi.fn().mockImplementation((port: number) => {
			return Promise.resolve(this.processInfoMap.get(port) ?? null)
		})
	}

	mockTerminateProcess(): ReturnType<typeof vi.fn> {
		return vi.fn().mockResolvedValue(true)
	}

	mockVerifyPortFree(): ReturnType<typeof vi.fn> {
		return vi.fn().mockImplementation((port: number) => {
			return Promise.resolve(this.processInfoMap.get(port) === null)
		})
	}

	mockCalculatePort(): ReturnType<typeof vi.fn> {
		return vi.fn().mockImplementation((num: number) => 3000 + num)
	}

	reset(): void {
		this.processInfoMap.clear()
	}
}
