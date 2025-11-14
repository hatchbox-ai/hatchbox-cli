import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { IloomSettingsSchema } from '../src/lib/SettingsManager.js'

async function exportSchema() {
	const jsonSchema = zodToJsonSchema(IloomSettingsSchema, {
		name: 'IloomSettings',
		$refStrategy: 'none', // Inline all references for simplicity
	})

	const outputDir = path.join(process.cwd(), 'dist', 'schema')
	const outputPath = path.join(outputDir, 'settings.schema.json')

	await mkdir(outputDir, { recursive: true })
	await writeFile(outputPath, JSON.stringify(jsonSchema, null, 2), 'utf-8')

	console.log(`✓ Schema exported to ${outputPath}`)
}

exportSchema().catch(console.error)
