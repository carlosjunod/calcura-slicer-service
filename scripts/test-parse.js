#!/usr/bin/env node
// scripts/test-parse.js
// Test the G-code parser against a real OrcaSlicer output file.
// Usage: node scripts/test-parse.js <path-to-gcode-or-dir>
//
// Run this BEFORE deploying to Railway to confirm the parser
// handles your specific OrcaSlicer output format.

import { parseGcode, findGcodeFile } from '../worker/gcode-parser.js'
import path from 'path'
import fs from 'fs/promises'

const target = process.argv[2]
if (!target) {
  console.error('Usage: node scripts/test-parse.js <path/to/file.gcode | path/to/output-dir>')
  process.exit(1)
}

let gcodeFile
try {
  const stat = await fs.stat(target)
  if (stat.isDirectory()) {
    gcodeFile = await findGcodeFile(target)
    console.log(`Found gcode: ${gcodeFile}`)
  } else {
    gcodeFile = target
  }
} catch (e) {
  console.error('Cannot access target:', e.message)
  process.exit(1)
}

console.log('\nParsing:', gcodeFile)
console.log('─'.repeat(60))

try {
  const result = await parseGcode(gcodeFile)

  console.log(`Print time:   ${result.printTimeStr} (${result.printTimeSec}s)`)
  console.log(`Layer count:  ${result.layerCount}`)
  console.log(`Total weight: ${result.totalWeightG}g (model only)`)
  console.log(`Total waste:  ${result.totalWasteG}g (flush/purge)`)
  console.log()

  result.filaments.forEach(f => {
    console.log(`Filament [${f.index}]:`)
    console.log(`  Model:    ${f.weightG}g  (${f.lengthMm}mm)`)
    console.log(`  Waste:    ${f.flushWasteG}g`)
    console.log(`  Total:    ${f.totalG}g`)
  })

  console.log('\n✓ Parser OK\n')
  console.log('Full result JSON:')
  console.log(JSON.stringify(result, null, 2))
} catch (e) {
  console.error('Parse error:', e.message)
  process.exit(1)
}
