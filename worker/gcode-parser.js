// gcode-parser.js
// Parses OrcaSlicer G-code comments to extract slicing stats.
// All 4 MVP fields: printTime, filaments (weight+waste), layerCount

import fs from 'fs/promises'
import path from 'path'

/**
 * @typedef {Object} FilamentUsage
 * @property {number} index         - filament slot (0-based)
 * @property {number} weightG       - model filament in grams
 * @property {number} lengthMm      - model filament in mm
 * @property {number} flushWasteG   - purge/flush waste in grams
 * @property {number} totalG        - weightG + flushWasteG
 */

/**
 * @typedef {Object} SliceResult
 * @property {number}          printTimeSec  - total print time in seconds
 * @property {string}          printTimeStr  - human-readable (e.g. "1h 23m 14s")
 * @property {FilamentUsage[]} filaments
 * @property {number}          totalWeightG  - sum of all filament weight (no waste)
 * @property {number}          totalWasteG   - sum of all flush waste
 * @property {number}          layerCount
 * @property {string}          gcodeFile     - path to parsed file
 */

/**
 * Parse OrcaSlicer gcode output file and return structured stats.
 * @param {string} gcodeFilePath
 * @returns {Promise<SliceResult>}
 */
export async function parseGcode(gcodeFilePath) {
  const raw = await fs.readFile(gcodeFilePath, 'utf8')
  const lines = raw.split('\n')

  let printTimeSec = 0
  let printTimeStr = ''
  let layerCount = 0
  const filamentWeightG = []   // per slot, model only
  const filamentLengthMm = []  // per slot, model only
  const flushMatrix = []       // flat flush_volumes_matrix
  let filamentDensity = []     // g/cm3 per slot (needed to convert flush mm3 → g)
  let colorCount = 0

  for (const line of lines) {
    const t = line.trim()

    // Print time — OrcaSlicer format: "; estimated printing time (normal mode) = 1h 23m 14s"
    const timeMatch = t.match(/^;\s*estimated printing time \(normal mode\)\s*=\s*(.+)/)
    if (timeMatch) {
      printTimeStr = timeMatch[1].trim()
      printTimeSec = parseTimeStr(printTimeStr)
      continue
    }

    // Filament weight (grams) — "; filament used [g] = 5.54, 0.70, 0.00, 0.00"
    const weightMatch = t.match(/^;\s*filament used \[g\]\s*=\s*(.+)/)
    if (weightMatch) {
      weightMatch[1].split(',').forEach((v, i) => {
        filamentWeightG[i] = parseFloat(v.trim()) || 0
      })
      colorCount = filamentWeightG.filter(w => w > 0).length
      continue
    }

    // Filament length (mm) — "; filament used [mm] = 1842.34, 234.12, ..."
    const lenMatch = t.match(/^;\s*filament used \[mm\]\s*=\s*(.+)/)
    if (lenMatch) {
      lenMatch[1].split(',').forEach((v, i) => {
        filamentLengthMm[i] = parseFloat(v.trim()) || 0
      })
      continue
    }

    // Flush volumes matrix — "; flush_volumes_matrix = 140, 60, 140, 60, ..."
    // Square matrix: NxN where N = number of filament slots
    // flush_volumes_matrix[from * N + to] = purge volume in mm3
    const flushMatch = t.match(/^;\s*flush_volumes_matrix\s*=\s*(.+)/)
    if (flushMatch) {
      flushMatch[1].split(',').forEach(v => {
        flushMatrix.push(parseFloat(v.trim()) || 0)
      })
      continue
    }

    // Filament density — "; filament_density = 1.24, 1.24, ..."
    const densityMatch = t.match(/^;\s*filament_density\s*=\s*(.+)/)
    if (densityMatch) {
      filamentDensity = densityMatch[1].split(',').map(v => parseFloat(v.trim()) || 1.24)
      continue
    }

    // Layer count — "; total layers count = 312"
    const layerMatch = t.match(/^;\s*total layers count\s*=\s*(\d+)/)
    if (layerMatch) {
      layerCount = parseInt(layerMatch[1], 10)
      continue
    }
  }

  // Calculate flush waste per filament slot from the matrix.
  // The matrix is NxN (flattened). Each row = source filament.
  // Sum of each column = total flush volume received by that slot (as destination).
  // We want total waste PRODUCED when switching FROM each filament → sum its row (excluding diagonal).
  const N = Math.round(Math.sqrt(flushMatrix.length))
  const flushWasteG = filamentWeightG.map((_, i) => {
    if (N === 0) return 0
    let totalMm3 = 0
    for (let j = 0; j < N; j++) {
      if (j !== i) {
        totalMm3 += flushMatrix[i * N + j] || 0
      }
    }
    const density = filamentDensity[i] || 1.24
    // mm3 → cm3 → g
    return parseFloat(((totalMm3 / 1000) * density).toFixed(3))
  })

  const filaments = filamentWeightG.map((w, i) => ({
    index: i,
    weightG: parseFloat(w.toFixed(3)),
    lengthMm: parseFloat((filamentLengthMm[i] || 0).toFixed(2)),
    flushWasteG: flushWasteG[i] || 0,
    totalG: parseFloat((w + (flushWasteG[i] || 0)).toFixed(3)),
  })).filter(f => f.weightG > 0 || f.flushWasteG > 0)

  return {
    printTimeSec,
    printTimeStr,
    filaments,
    totalWeightG: parseFloat(filaments.reduce((s, f) => s + f.weightG, 0).toFixed(3)),
    totalWasteG: parseFloat(filaments.reduce((s, f) => s + f.flushWasteG, 0).toFixed(3)),
    layerCount,
    gcodeFile: gcodeFilePath,
  }
}

/**
 * Parse "1h 23m 14s" → seconds
 * Also handles "23m 14s", "14s", "2d 1h 23m" etc.
 */
function parseTimeStr(str) {
  let secs = 0
  const d = str.match(/(\d+)d/)
  const h = str.match(/(\d+)h/)
  const m = str.match(/(\d+)m/)
  const s = str.match(/(\d+)s/)
  if (d) secs += parseInt(d[1]) * 86400
  if (h) secs += parseInt(h[1]) * 3600
  if (m) secs += parseInt(m[1]) * 60
  if (s) secs += parseInt(s[1])
  return secs
}

/**
 * Find the first .gcode file in a directory (OrcaSlicer output dir)
 */
export async function findGcodeFile(outputDir) {
  const files = await fs.readdir(outputDir)
  const gcode = files.find(f => f.endsWith('.gcode') || f.endsWith('.gcode.3mf'))
  if (!gcode) throw new Error(`No .gcode file found in ${outputDir}`)
  return path.join(outputDir, gcode)
}
