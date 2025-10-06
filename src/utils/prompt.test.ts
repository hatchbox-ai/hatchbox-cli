import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as readline from 'node:readline'
import { promptConfirmation, promptInput } from './prompt.js'

vi.mock('node:readline')

describe('prompt utils', () => {
	let mockRl: {
		question: ReturnType<typeof vi.fn>
		close: ReturnType<typeof vi.fn>
	}

	beforeEach(() => {
		mockRl = {
			question: vi.fn(),
			close: vi.fn(),
		}

		vi.mocked(readline.createInterface).mockReturnValue(
			mockRl as unknown as readline.Interface
		)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe('promptConfirmation', () => {
		it('should return true for "y" input', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('y')
			})

			const result = await promptConfirmation('Confirm?')

			expect(result).toBe(true)
			expect(mockRl.close).toHaveBeenCalled()
		})

		it('should return true for "yes" input', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('yes')
			})

			const result = await promptConfirmation('Confirm?')

			expect(result).toBe(true)
		})

		it('should return true for "Y" input (uppercase)', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('Y')
			})

			const result = await promptConfirmation('Confirm?')

			expect(result).toBe(true)
		})

		it('should return false for "n" input', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('n')
			})

			const result = await promptConfirmation('Confirm?')

			expect(result).toBe(false)
		})

		it('should return false for "no" input', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('no')
			})

			const result = await promptConfirmation('Confirm?')

			expect(result).toBe(false)
		})

		it('should return default value for empty input (false)', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('')
			})

			const result = await promptConfirmation('Confirm?')

			expect(result).toBe(false)
		})

		it('should return default value for empty input (true)', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('')
			})

			const result = await promptConfirmation('Confirm?', true)

			expect(result).toBe(true)
		})

		it('should use default value for invalid input', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('invalid')
			})

			const result = await promptConfirmation('Confirm?', false)

			expect(result).toBe(false)
		})

		it('should show [Y/n] suffix when default is true', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('')
			})

			await promptConfirmation('Confirm?', true)

			expect(mockRl.question).toHaveBeenCalledWith(
				expect.stringContaining('[Y/n]'),
				expect.any(Function)
			)
		})

		it('should show [y/N] suffix when default is false', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('')
			})

			await promptConfirmation('Confirm?', false)

			expect(mockRl.question).toHaveBeenCalledWith(
				expect.stringContaining('[y/N]'),
				expect.any(Function)
			)
		})
	})

	describe('promptInput', () => {
		it('should return user input', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('test input')
			})

			const result = await promptInput('Enter value')

			expect(result).toBe('test input')
			expect(mockRl.close).toHaveBeenCalled()
		})

		it('should trim whitespace from input', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('  test input  ')
			})

			const result = await promptInput('Enter value')

			expect(result).toBe('test input')
		})

		it('should return default value for empty input', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('')
			})

			const result = await promptInput('Enter value', 'default')

			expect(result).toBe('default')
		})

		it('should return empty string for empty input when no default', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('')
			})

			const result = await promptInput('Enter value')

			expect(result).toBe('')
		})

		it('should show default value in prompt', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('')
			})

			await promptInput('Enter value', 'default')

			expect(mockRl.question).toHaveBeenCalledWith(
				expect.stringContaining('[default]'),
				expect.any(Function)
			)
		})

		it('should not show default when not provided', async () => {
			mockRl.question.mockImplementation((_, callback) => {
				callback('test')
			})

			await promptInput('Enter value')

			expect(mockRl.question).toHaveBeenCalledWith(
				'Enter value: ',
				expect.any(Function)
			)
		})
	})
})
