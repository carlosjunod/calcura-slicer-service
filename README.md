# calcura-slicer-service

OrcaSlicer headless slicing microservice for Calcura3D.
Accepts `.3mf` / `.stl` uploads, runs OrcaSlicer CLI in Docker, returns
print time, per-filament weight, flush waste, and layer count as JSON.

## Stack

- OrcaSlicer v2.3.2 (AppImage extracted, no FUSE required)
- Xvfb (virtual display — OrcaSlicer CLI still needs a display context)
- BullMQ + Redis (job queue)
- Fastify (REST API)
- Railway (linux/amd64 deployment target)

---

## Step 1 — Validate the parser locally (no Docker needed)

Slice a `.3mf` in your local OrcaSlicer GUI, find the `.gcode` output,
then run:

```bash
npm install
node scripts/test-parse.js /path/to/your/output.gcode
```

This confirms the parser handles your specific OrcaSlicer output before
you touch Docker. Check that `filaments`, `flushWasteG`, `printTimeStr`,
and `layerCount` all have real values.

---

## Step 2 — Build and test Docker locally (Mac M1: use --platform)

```bash
# Build for linux/amd64 (matches Railway)
docker build \
  --platform linux/amd64 \
  -t calcura-slicer \
  -f worker/Dockerfile .

# Test: slice a .3mf file
docker run --rm \
  --platform linux/amd64 \
  -v /path/to/your/file.3mf:/input/model.3mf \
  -v /tmp/orca-out:/output \
  calcura-slicer \
  /usr/local/bin/slice.sh /input/model.3mf /output

# Inspect output
ls /tmp/orca-out
```

Note: On M1 Mac, `--platform linux/amd64` runs via Rosetta emulation.
Slicing will be slow (5-15x) but functional for testing.

---

## Step 3 — Add printer profiles

OrcaSlicer profiles are JSON files extracted from the app's config directory.

**On macOS:** `~/Library/Application Support/OrcaSlicer/user/`

Copy the printer and filament JSONs you use into:
```
profiles/
  printers/
    creality_k2plus_cfs.json
  filaments/
    pla_basic.json
    pla_silk_red.json
```

The API maps the `printer` and `filaments` request fields to these filenames.

---

## Step 4 — Deploy to Railway

1. Push repo to GitHub
2. New Railway project → Deploy from GitHub repo
3. Add Redis plugin (Railway provides `REDIS_URL` automatically)
4. Set env vars from `.env.example`
5. Railway uses `railway.toml` → builds Dockerfile → starts worker

Add a second Railway service from the same repo with start command
`node api/index.js` for the REST API.

---

## API reference

### POST /slice
```
Content-Type: multipart/form-data
x-api-key: <SLICER_API_KEY>

Fields:
  file      — .3mf / .stl file (required)
  printer   — printer profile name, no extension (optional)
  filaments — JSON array of filament profile names (optional)

Response 202:
  { "jobId": "12" }
```

### GET /slice/:jobId
```
Response (pending):  { "status": "active", "progress": 40 }
Response (done):     { "status": "completed", "progress": 100, "result": { ... } }
Response (failed):   { "status": "failed", "error": "..." }
```

### Result schema
```json
{
  "printTimeSec": 4994,
  "printTimeStr": "1h 23m 14s",
  "layerCount": 312,
  "totalWeightG": 14.23,
  "totalWasteG": 2.81,
  "filaments": [
    {
      "index": 0,
      "weightG": 10.54,
      "lengthMm": 3521.4,
      "flushWasteG": 1.92,
      "totalG": 12.46
    },
    {
      "index": 1,
      "weightG": 3.69,
      "lengthMm": 1231.2,
      "flushWasteG": 0.89,
      "totalG": 4.58
    }
  ]
}
```

---

## Known limitations (MVP)

- **Off-bed poop purge**: OrcaSlicer doesn't emit flush waste in the gcode comments
  when purge is handled off-bed (K2+ poop chute). The `flushWasteG` values come from
  `flush_volumes_matrix` in the gcode header — these are the *configured* volumes,
  not measured actuals. Accuracy is ±10-15% vs reality.

- **K2+ CFS profiles**: You need to export your personal K2+ printer profile JSON
  from OrcaSlicer and bundle it with the service. Without a matching profile,
  OrcaSlicer falls back to a generic FDM profile (times will be off).

- **ARM not supported**: OrcaSlicer AppImage is amd64 only. Railway runs amd64.
  Local testing on M1 Mac requires `--platform linux/amd64` (emulated, slow).
