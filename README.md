# pdf2skill-backend

Standalone backend and CLI for compiling one or more PDFs into Claude/OpenCode skill packs.

## What is included

- CLI compiler (`index.js`)
- Backend API (`server.js`)
- Deploy files (`Dockerfile`, `render.yaml`)

This repository intentionally excludes the standalone frontend project.

## Install

```bash
npm install
```

## Start API

```bash
npm start
```

Health check:

- `GET /health`

Compile endpoint:

- `POST /api/compile` (multipart form, field name: `pdfs`)

## Security env vars

- `COMPILE_TOKEN`: enable token auth for `/api/compile`
- `MAX_UPLOAD_MB`: max upload size per file (default `100`)
- `OUTPUT_TTL_HOURS`: cleanup old artifacts in `web-output` (default `24`)

Example:

```bash
COMPILE_TOKEN=change-me MAX_UPLOAD_MB=50 OUTPUT_TTL_HOURS=12 npm start
```

When token is set, call API with header:

```txt
x-compile-token: <COMPILE_TOKEN>
```

## CLI usage

```bash
node index.js --input "D:/path/to/book.pdf" --name "game-design" --outdir "D:/output" --max-chunks 24 --min-score 55 --lang auto
```

Multi-file compile:

```bash
node index.js --input "D:/books/a.pdf,D:/books/b.pdf" --name "merged-knowledge" --outdir "D:/output" --lang zh
```

## Output

If `--name game-design` and `--outdir D:/output`:

- Folder: `D:/output/game-design/`
- Zip: `D:/output/game-design.zip`

## Deploy

This repo includes `Dockerfile` and `render.yaml` for direct deployment to Render/Railway style environments.
