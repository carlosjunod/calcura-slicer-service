// api/index.js
// Fastify REST API for Calcura3D slicing service.
// POST /slice      → enqueue job, return jobId
// GET  /slice/:id  → poll result
// GET  /health     → liveness

import Fastify from 'fastify'
import multipart from '@fastify/multipart'
import { Queue } from 'bullmq'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import crypto from 'crypto'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const API_KEY = process.env.SLICER_API_KEY // optional: set in Railway env vars
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(os.tmpdir(), 'slicer-uploads')

const connection = {
  host: new URL(REDIS_URL).hostname,
  port: parseInt(new URL(REDIS_URL).port || '6379'),
  password: new URL(REDIS_URL).password || undefined,
}

const queue = new Queue('slice-jobs', { connection })

const app = Fastify({ logger: true })
await app.register(multipart, { limits: { fileSize: 100 * 1024 * 1024 } }) // 100MB max

// Ensure upload dir exists
await fs.mkdir(UPLOAD_DIR, { recursive: true })

// Auth middleware (optional)
app.addHook('onRequest', async (req, reply) => {
  if (!API_KEY) return
  if (req.url === '/health') return
  const key = req.headers['x-api-key']
  if (key !== API_KEY) {
    reply.code(401).send({ error: 'Unauthorized' })
  }
})

/**
 * POST /slice
 * Multipart form:
 *   - file: .3mf or .stl file (required)
 *   - printer: printer profile name (optional, e.g. "creality_k2plus_cfs")
 *   - filaments: JSON array of filament profile names (optional)
 *
 * Returns: { jobId: string }
 */
app.post('/slice', async (req, reply) => {
  const parts = req.parts()
  let fileBuffer, fileName, printer, filaments

  for await (const part of parts) {
    if (part.type === 'file' && part.fieldname === 'file') {
      fileName = part.filename
      fileBuffer = await part.toBuffer()
    } else if (part.type === 'field') {
      if (part.fieldname === 'printer') printer = part.value
      if (part.fieldname === 'filaments') {
        try { filaments = JSON.parse(part.value) } catch { filaments = [] }
      }
    }
  }

  if (!fileBuffer || !fileName) {
    return reply.code(400).send({ error: 'Missing file field' })
  }

  const ext = path.extname(fileName).toLowerCase()
  if (!['.3mf', '.stl', '.obj'].includes(ext)) {
    return reply.code(400).send({ error: 'Unsupported file type. Use .3mf, .stl, or .obj' })
  }

  // Save to disk with unique name
  const uid = crypto.randomUUID()
  const inputPath = path.join(UPLOAD_DIR, `${uid}${ext}`)
  await fs.writeFile(inputPath, fileBuffer)

  // Resolve profile paths if names provided
  const PROFILES_DIR = process.env.PROFILES_DIR || '/app/profiles'
  const printerProfile = printer
    ? path.join(PROFILES_DIR, 'printers', `${printer}.json`)
    : null
  const filamentProfiles = filaments
    ? filaments.map(f => path.join(PROFILES_DIR, 'filaments', `${f}.json`))
    : []

  const job = await queue.add('slice', {
    inputPath,
    printerProfile,
    filamentProfiles,
    originalName: fileName,
    uploadedAt: new Date().toISOString(),
  })

  return reply.code(202).send({ jobId: job.id })
})

/**
 * GET /slice/:jobId
 * Returns job status + result when done.
 *
 * Response:
 *   { status: 'waiting'|'active'|'completed'|'failed', progress: number, result?, error? }
 */
app.get('/slice/:jobId', async (req, reply) => {
  const job = await queue.getJob(req.params.jobId)
  if (!job) return reply.code(404).send({ error: 'Job not found' })

  const state = await job.getState()
  const progress = job.progress || 0

  if (state === 'completed') {
    return { status: 'completed', progress: 100, result: job.returnvalue }
  }

  if (state === 'failed') {
    return { status: 'failed', progress: 0, error: job.failedReason }
  }

  return { status: state, progress }
})

/**
 * GET /health
 */
app.get('/health', async () => {
  return { ok: true, ts: new Date().toISOString() }
})

const PORT = parseInt(process.env.PORT || '3000')
await app.listen({ port: PORT, host: '0.0.0.0' })
console.log(`Slicer API listening on port ${PORT}`)
