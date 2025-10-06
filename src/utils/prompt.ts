import * as readline from 'node:readline'
import { logger } from './logger.js'

/**
 * Prompt user for confirmation (yes/no)
 * @param message The question to ask the user
 * @param defaultValue Default value if user just presses enter (default: false)
 * @returns Promise<boolean> - true if user confirms, false otherwise
 */
export async function promptConfirmation(
	message: string,
	defaultValue = false
): Promise<boolean> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	})

	const suffix = defaultValue ? '[Y/n]' : '[y/N]'
	const fullMessage = `${message} ${suffix}: `

	return new Promise((resolve) => {
		rl.question(fullMessage, (answer) => {
			rl.close()

			const normalized = answer.trim().toLowerCase()

			if (normalized === '') {
				resolve(defaultValue)
				return
			}

			if (normalized === 'y' || normalized === 'yes') {
				resolve(true)
				return
			}

			if (normalized === 'n' || normalized === 'no') {
				resolve(false)
				return
			}

			// Invalid input, use default
			logger.warn('Invalid input, using default value', {
				input: answer,
				defaultValue,
			})
			resolve(defaultValue)
		})
	})
}

/**
 * Prompt user for text input
 * @param message The prompt message
 * @param defaultValue Optional default value
 * @returns Promise<string> - the user's input
 */
export async function promptInput(
	message: string,
	defaultValue?: string
): Promise<string> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	})

	const suffix = defaultValue ? ` [${defaultValue}]` : ''
	const fullMessage = `${message}${suffix}: `

	return new Promise((resolve) => {
		rl.question(fullMessage, (answer) => {
			rl.close()

			const trimmed = answer.trim()

			if (trimmed === '' && defaultValue !== undefined) {
				resolve(defaultValue)
				return
			}

			resolve(trimmed)
		})
	})
}
