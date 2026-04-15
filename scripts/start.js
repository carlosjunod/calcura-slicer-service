// scripts/start.js
// Entry point for Railway. Routes to api or worker based on SERVICE_ROLE env var.
// Set SERVICE_ROLE=api or SERVICE_ROLE=worker in Railway dashboard per service.

const role = process.env.SERVICE_ROLE

if (role === 'api') {
  console.log('[start] Launching API service...')
  await import('../api/index.js')
} else if (role === 'worker') {
  console.log('[start] Launching Worker service...')
  await import('../worker/index.js')
} else {
  console.error('[start] ERROR: SERVICE_ROLE env var not set.')
  console.error('        Set SERVICE_ROLE=api or SERVICE_ROLE=worker in Railway dashboard.')
  process.exit(1)
}
