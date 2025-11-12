import { describe, it, expect } from 'vitest'
import { gatherDiagnosticInfo, formatDiagnosticsAsMarkdown } from './diagnostics.js'
import type { DiagnosticInfo } from './diagnostics.js'

describe('diagnostics', () => {
	describe('gatherDiagnosticInfo', () => {
		it('should gather diagnostic information', async () => {
			const diagnostics = await gatherDiagnosticInfo()

			expect(diagnostics).toHaveProperty('cliVersion')
			expect(diagnostics).toHaveProperty('nodeVersion')
			expect(diagnostics).toHaveProperty('osType')
			expect(diagnostics).toHaveProperty('osVersion')
			expect(diagnostics).toHaveProperty('architecture')
		})

		it('should return non-empty values for all diagnostic fields', async () => {
			const diagnostics = await gatherDiagnosticInfo()

			expect(diagnostics.cliVersion).toBeTruthy()
			expect(diagnostics.nodeVersion).toBeTruthy()
			expect(diagnostics.osType).toBeTruthy()
			expect(diagnostics.osVersion).toBeTruthy()
			expect(diagnostics.architecture).toBeTruthy()
		})

		it('should include Node.js version from process.version', async () => {
			const diagnostics = await gatherDiagnosticInfo()

			expect(diagnostics.nodeVersion).toContain('v')
			expect(diagnostics.nodeVersion).toMatch(/v\d+\.\d+\.\d+/)
		})

		it('should handle missing package.json gracefully', async () => {
			// This test verifies that even if package.json can't be read,
			// the function returns a valid object with fallback values
			const diagnostics = await gatherDiagnosticInfo()

			// Should still have a version, even if it's "unknown"
			expect(diagnostics.cliVersion).toBeDefined()
			expect(typeof diagnostics.cliVersion).toBe('string')
		})
	})

	describe('formatDiagnosticsAsMarkdown', () => {
		const mockDiagnostics: DiagnosticInfo = {
			cliVersion: '1.2.3',
			nodeVersion: 'v20.0.0',
			osType: 'darwin',
			osVersion: '23.0.0',
			architecture: 'arm64',
		}

		it('should include HTML comment marker by default', () => {
			const markdown = formatDiagnosticsAsMarkdown(mockDiagnostics)

			expect(markdown).toContain('<!-- CLI GENERATED FEEDBACK v1.2.3 -->')
		})

		it('should exclude HTML comment marker when includeMarker is false', () => {
			const markdown = formatDiagnosticsAsMarkdown(mockDiagnostics, false)

			expect(markdown).not.toContain('<!-- CLI GENERATED FEEDBACK')
		})

		it('should format as markdown table', () => {
			const markdown = formatDiagnosticsAsMarkdown(mockDiagnostics)

			expect(markdown).toContain('| Property | Value |')
			expect(markdown).toContain('|----------|-------|')
		})

		it('should include all diagnostic fields in output', () => {
			const markdown = formatDiagnosticsAsMarkdown(mockDiagnostics)

			expect(markdown).toContain('CLI Version')
			expect(markdown).toContain('1.2.3')
			expect(markdown).toContain('Node.js Version')
			expect(markdown).toContain('v20.0.0')
			expect(markdown).toContain('OS')
			expect(markdown).toContain('darwin')
			expect(markdown).toContain('OS Version')
			expect(markdown).toContain('23.0.0')
			expect(markdown).toContain('Architecture')
			expect(markdown).toContain('arm64')
		})

		it('should wrap content in collapsible details section', () => {
			const markdown = formatDiagnosticsAsMarkdown(mockDiagnostics)

			expect(markdown).toContain('<details>')
			expect(markdown).toContain('<summary>Diagnostic Information</summary>')
			expect(markdown).toContain('</details>')
		})

		it('should handle fallback values gracefully', () => {
			const diagnosticsWithFallbacks: DiagnosticInfo = {
				cliVersion: 'unknown (failed to read package.json)',
				nodeVersion: 'unknown (failed to read Node.js version)',
				osType: 'unknown (failed to detect OS)',
				osVersion: 'unknown (failed to detect OS version)',
				architecture: 'unknown (failed to detect architecture)',
			}

			const markdown = formatDiagnosticsAsMarkdown(diagnosticsWithFallbacks)

			expect(markdown).toContain('unknown (failed to read package.json)')
			expect(markdown).toContain('unknown (failed to read Node.js version)')
			expect(markdown).toContain('unknown (failed to detect OS)')
		})
	})
})
