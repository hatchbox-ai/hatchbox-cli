/**
 * Custom YAML frontmatter parser for agent markdown files
 * Replaces gray-matter dependency with lightweight custom implementation
 */

interface ParseResult {
	data: Record<string, string>
	content: string
}

export class MarkdownAgentParser {
	/**
	 * Parse markdown content with YAML frontmatter
	 * @param content - Raw markdown file content
	 * @returns Object with parsed frontmatter data and markdown body content
	 * @throws Error if frontmatter is malformed or missing
	 */
	static parse(content: string): ParseResult {
		const lines = content.split('\n')

		// Check for opening frontmatter delimiter
		if (lines[0]?.trim() !== '---') {
			throw new Error('Missing opening frontmatter delimiter (---)')
		}

		// Find closing frontmatter delimiter
		let closingDelimiterIndex = -1
		for (let i = 1; i < lines.length; i++) {
			if (lines[i]?.trim() === '---') {
				closingDelimiterIndex = i
				break
			}
		}

		if (closingDelimiterIndex === -1) {
			throw new Error('Missing closing frontmatter delimiter (---)')
		}

		// Extract frontmatter lines (between the delimiters)
		const frontmatterLines = lines.slice(1, closingDelimiterIndex)

		// Extract markdown body (after closing delimiter)
		const bodyLines = lines.slice(closingDelimiterIndex + 1)
		const markdownBody = bodyLines.join('\n')

		// Parse YAML frontmatter into key-value pairs
		const data = this.parseYaml(frontmatterLines.join('\n'))

		return {
			data,
			content: markdownBody,
		}
	}

	/**
	 * Parse simplified YAML into key-value object
	 * Supports:
	 * - Simple key: value pairs
	 * - Multiline values with | indicator
	 * - Values with special characters and newlines
	 *
	 * @param yaml - YAML string to parse
	 * @returns Object with parsed key-value pairs
	 */
	private static parseYaml(yaml: string): Record<string, string> {
		const result: Record<string, string> = {}
		const lines = yaml.split('\n')
		let currentKey: string | null = null
		let currentValue: string[] = []
		let isMultiline = false

		const finalizeCurrent = (): void => {
			if (currentKey && currentValue.length > 0) {
				result[currentKey] = currentValue.join('\n').trim()
				currentKey = null
				currentValue = []
			}
		}

		for (const line of lines) {
			// Skip empty lines when not in multiline mode
			if (!isMultiline && line.trim() === '') {
				continue
			}

			// Check if this is a new key-value pair
			const keyValueMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:\s*(.*)$/)

			if (keyValueMatch && !isMultiline) {
				// Finalize previous key if exists
				finalizeCurrent()

				const [, key, value] = keyValueMatch
				if (!key || value === undefined) {
					continue
				}
				currentKey = key

				// Check for multiline indicator
				if (value.trim() === '|') {
					isMultiline = true
					currentValue = []
				} else {
					// Single line value
					currentValue = [value]
					finalizeCurrent()
					isMultiline = false
				}
			} else if (isMultiline && currentKey) {
				// Continuation of multiline value
				// Check if we've returned to normal indentation (new key)
				if (line.match(/^[a-zA-Z_][a-zA-Z0-9_-]*\s*:/) && !line.startsWith(' ')) {
					// End of multiline, this is a new key
					finalizeCurrent()
					isMultiline = false

					// Process this line as a new key
					const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:\s*(.*)$/)
					if (match) {
						const [, key, value] = match
						if (key && value !== undefined) {
							currentKey = key
							currentValue = [value]
							finalizeCurrent()
						}
					}
				} else {
					// Remove leading spaces (common indentation) from multiline values
					const trimmedLine = line.replace(/^ {2}/, '')
					currentValue.push(trimmedLine)
				}
			}
		}

		// Finalize last key
		finalizeCurrent()

		return result
	}
}
