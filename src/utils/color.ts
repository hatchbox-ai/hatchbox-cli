import { createHash } from 'crypto'
import logger from './logger'

/**
 * RGB color representation
 */
export interface RgbColor {
	r: number
	g: number
	b: number
}

/**
 * Complete color data with RGB, hex, and palette index
 */
export interface ColorData {
	rgb: RgbColor
	hex: string
	index: number
}

/**
 * Get the predefined color palette (40 subtle, professional colors)
 * Matches the terminal color palette from bash/new-branch-workflow.sh
 *
 * @returns Array of 40 RGB colors
 */
export function getColorPalette(): RgbColor[] {
	return [
		// First 10 colors preserved for backward compatibility
		{ r: 220, g: 235, b: 248 }, // 0: Soft blue
		{ r: 248, g: 220, b: 235 }, // 1: Soft pink
		{ r: 220, g: 248, b: 235 }, // 2: Soft green
		{ r: 248, g: 240, b: 220 }, // 3: Soft cream
		{ r: 240, g: 220, b: 248 }, // 4: Soft lavender
		{ r: 220, g: 240, b: 248 }, // 5: Soft cyan
		{ r: 235, g: 235, b: 235 }, // 6: Soft grey
		{ r: 228, g: 238, b: 248 }, // 7: Soft ice blue
		{ r: 248, g: 228, b: 238 }, // 8: Soft rose
		{ r: 228, g: 248, b: 238 }, // 9: Soft mint
		// 30 new colors (indices 10-39)
		{ r: 235, g: 245, b: 250 }, // 10: Pale sky blue
		{ r: 250, g: 235, b: 245 }, // 11: Pale orchid
		{ r: 235, g: 250, b: 245 }, // 12: Pale seafoam
		{ r: 250, g: 245, b: 235 }, // 13: Pale peach
		{ r: 245, g: 235, b: 250 }, // 14: Pale periwinkle
		{ r: 235, g: 245, b: 235 }, // 15: Pale sage
		{ r: 245, g: 250, b: 235 }, // 16: Pale lemon
		{ r: 245, g: 235, b: 235 }, // 17: Pale blush
		{ r: 235, g: 235, b: 250 }, // 18: Pale lavender blue
		{ r: 250, g: 235, b: 235 }, // 19: Pale coral
		{ r: 235, g: 250, b: 250 }, // 20: Pale aqua
		{ r: 240, g: 248, b: 255 }, // 21: Alice blue
		{ r: 255, g: 240, b: 248 }, // 22: Lavender blush
		{ r: 240, g: 255, b: 248 }, // 23: Honeydew tint
		{ r: 255, g: 248, b: 240 }, // 24: Antique white
		{ r: 248, g: 240, b: 255 }, // 25: Magnolia
		{ r: 240, g: 248, b: 240 }, // 26: Mint cream tint
		{ r: 248, g: 255, b: 240 }, // 27: Ivory tint
		{ r: 248, g: 240, b: 240 }, // 28: Misty rose tint
		{ r: 240, g: 240, b: 255 }, // 29: Ghost white tint
		{ r: 255, g: 245, b: 238 }, // 30: Seashell
		{ r: 245, g: 255, b: 250 }, // 31: Azure mist
		{ r: 250, g: 245, b: 255 }, // 32: Lilac mist
		{ r: 255, g: 250, b: 245 }, // 33: Snow peach
		{ r: 238, g: 245, b: 255 }, // 34: Powder blue
		{ r: 255, g: 238, b: 245 }, // 35: Pink lace
		{ r: 245, g: 255, b: 238 }, // 36: Pale lime
		{ r: 238, g: 255, b: 245 }, // 37: Pale turquoise
		{ r: 245, g: 238, b: 255 }, // 38: Pale violet
		{ r: 255, g: 245, b: 255 }, // 39: Pale magenta
	]
}

/**
 * Convert RGB values to hex color format
 *
 * @param r - Red value (0-255)
 * @param g - Green value (0-255)
 * @param b - Blue value (0-255)
 * @returns Hex color string (e.g., "#dcebf8")
 * @throws Error if RGB values are out of range
 */
export function rgbToHex(r: number, g: number, b: number): string {
	// Validate RGB values
	if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) {
		throw new Error('RGB values must be between 0 and 255')
	}

	// Convert to hex and pad with zeros
	const rHex = r.toString(16).padStart(2, '0')
	const gHex = g.toString(16).padStart(2, '0')
	const bHex = b.toString(16).padStart(2, '0')

	return `#${rHex}${gHex}${bHex}`
}

/**
 * Convert hex color format to RGB values
 *
 * @param hex - Hex color string (with or without # prefix)
 * @returns RGB color object
 * @throws Error if hex format is invalid
 */
export function hexToRgb(hex: string): RgbColor {
	// Remove # prefix if present
	const cleanHex = hex.startsWith('#') ? hex.slice(1) : hex

	// Validate format (must be exactly 6 hex characters)
	if (cleanHex.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(cleanHex)) {
		throw new Error('Invalid hex color format. Expected format: #RRGGBB or RRGGBB')
	}

	// Parse hex values
	const r = parseInt(cleanHex.slice(0, 2), 16)
	const g = parseInt(cleanHex.slice(2, 4), 16)
	const b = parseInt(cleanHex.slice(4, 6), 16)

	return { r, g, b }
}

/**
 * Generate deterministic color from branch name using SHA256 hash
 * Matches the bash implementation in bash/new-branch-workflow.sh
 *
 * @param branchName - Branch name to generate color from
 * @returns ColorData with RGB, hex, and palette index
 */
export function generateColorFromBranchName(branchName: string): ColorData {
	// Generate SHA256 hash of branch name
	const hash = createHash('sha256').update(branchName).digest('hex')

	// Take first 8 hex characters and convert to index (0-39)
	// Matches bash: local index=$(( 0x$hash % ${#colors[@]} ))
	const hashPrefix = hash.slice(0, 8)
	const palette = getColorPalette()
	const hashAsInt = parseInt(hashPrefix, 16)
	const index = hashAsInt % palette.length
	logger.debug(`[generateColorFromBranchName] Branch name: ${branchName}, Hash: ${hash}, Hash prefix: ${hashPrefix}, Hash as int: ${hashAsInt}, Index: ${index}`)

	// Get color from palette
	const rgb = palette[index]

	// This should never happen as index is always in range [0, palette.length)
	if (!rgb) {
		throw new Error(`Invalid color index: ${index}`)
	}

	// Convert to hex format
	const hex = rgbToHex(rgb.r, rgb.g, rgb.b)

	return {
		rgb,
		hex,
		index,
	}
}

/**
 * Lighten a color by a given amount
 * Useful for creating slightly lighter variants for hover states
 *
 * @param rgb - RGB color to lighten
 * @param amount - Amount to lighten (0-1, where 0.1 = 10% lighter)
 * @returns Lightened RGB color
 */
export function lightenColor(rgb: RgbColor, amount: number): RgbColor {
	const clamp = (value: number): number => Math.min(255, Math.max(0, Math.round(value)))

	return {
		r: clamp(rgb.r + (255 - rgb.r) * amount),
		g: clamp(rgb.g + (255 - rgb.g) * amount),
		b: clamp(rgb.b + (255 - rgb.b) * amount),
	}
}

/**
 * Saturate a color by pushing it away from grey towards its dominant hue
 * Makes subtle colors more vivid while maintaining their hue
 *
 * @param rgb - RGB color to saturate
 * @param amount - Amount to saturate (0-1, where 0.4 = 40% more saturated)
 * @returns Saturated RGB color
 */
export function saturateColor(rgb: RgbColor, amount: number): RgbColor {
	const clamp = (value: number): number => Math.min(255, Math.max(0, Math.round(value)))

	// Calculate average (grey point)
	const avg = (rgb.r + rgb.g + rgb.b) / 3

	// Push each channel away from grey
	return {
		r: clamp(rgb.r + (rgb.r - avg) * amount),
		g: clamp(rgb.g + (rgb.g - avg) * amount),
		b: clamp(rgb.b + (rgb.b - avg) * amount),
	}
}

/**
 * Calculate appropriate foreground color (black or white) for a given background
 * Uses relative luminance formula from WCAG 2.0
 *
 * @param rgb - Background RGB color
 * @returns '#000000' for light backgrounds, '#ffffff' for dark backgrounds
 */
export function calculateForegroundColor(rgb: RgbColor): string {
	// Convert RGB to relative luminance (WCAG 2.0 formula)
	const toLinear = (channel: number): number => {
		const c = channel / 255
		return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
	}

	const r = toLinear(rgb.r)
	const g = toLinear(rgb.g)
	const b = toLinear(rgb.b)

	const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b

	// Use black text for light backgrounds (luminance > 0.5)
	// Use white text for dark backgrounds
	return luminance > 0.5 ? '#000000' : '#ffffff'
}
