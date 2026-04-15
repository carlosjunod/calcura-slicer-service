// worker/index.js
// BullMQ worker: receives slice jobs, runs OrcaSlicer CLI, returns parsed stats.

import { Worker } from 'bullmq'
import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { parseGcode, findGcodeFile } from './gcode-parser.js'

const execFileAsync = promisify(execFile)

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const SLICE_TIMEOUT_MS = parseInt(process.env.SLICE_TIMEOUT_MS || '300000') // 5 min default

const connection = {
  host: new URL(REDIS_URL).hostname,
  port: parseInt(new URL(REDIS_URL).port || '6379'),
  password: new URL(REDIS_URL).password || undefined,
}

const worker = new Worker('slice-jobs', async (job) => {
  const { inputPath, printerProfile, filamentProfiles } = job.data
  console.log(`[job ${job.id}] Starting slice: ${inputPath}`)

  // Create temp output dir
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), `orca-out-${job.id}-`))

  try {
    await job.updateProgress(10)

    // Build OrcaSlicer CLI args
    // --slice 0 = all plates
    // --load-settings = printer profile json
    // --load-filaments = comma-separated filament profile jsons
    const args = [
      inputPath,
      '--slice', '0',
      '--export-3mf', outputDir,
    ]

    if (printerProfile) {
      args.push('--load-settings', printerProfile)
    }

    if (filamentProfiles && filamentProfiles.length > 0) {
      args.push('--load-filaments', filamentProfiles.join(';'))
    }

    await job.updateProgress(20)

    // Run via xvfb-wrapped script
    const { stdout, stderr } = await execFileAsync(
      '/usr/local/bin/slice.sh',
      args,
      {
        timeout: SLICE_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024, // 10MB stdout buffer
      }
    )

    if (stderr) console.log(`[job ${job.id}] stderr: ${stderr.slice(0, 500)}`)

    await job.updateProgress(70)

    // OrcaSlicer can output .gcode or .gcode.3mf depending on printer type.
    // For stats we need the plain .gcode.
    // Check output dir for both.
    const files = await fs.readdir(outputDir)
    console.log(`[job ${job.id}] Output files:`, files)

    const gcodeFile = await findGcodeFile(outputDir)
    await job.updateProgress(80)

    const result = await parseGcode(gcodeFile)
    await job.updateProgress(100)

    console.log(`[job ${job.id}] Done:`, {
      time: result.printTimeStr,
      filaments: result.filaments.length,
      totalG: result.totalWeightG,
    })

    return result

  } finally {
    // Always clean up temp dir
    await fs.rm(outputDir, { recursive: true, force: true })
  }

}, {
  connection,
  concurrency: parseInt(process.env.WORKER_CONCURRENCY || '2'),
  // Retry once on failure (segfault protection)
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 2000 },
  },
})

worker.on('completed', (job, result) => {
  console.log(`[job ${job.id}] Completed — ${result.printTimeStr} / ${result.totalWeightG}g`)
})

worker.on('failed', (job, err) => {
  console.error(`[job ${job.id}] Failed:`, err.message)
})

worker.on('error', (err) => {
  console.error('Worker error:', err)
})

console.log('OrcaSlicer worker started — concurrency:', worker.opts.concurrency)
