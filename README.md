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
- `outputMode=skills|game|app|wechat`

WeChat status endpoint:

- `GET /api/wechat/status` (same auth rule as `/api/compile`)

## Security env vars

- `COMPILE_TOKEN`: enable token auth for `/api/compile`
- `MAX_UPLOAD_MB`: max upload size per file (default `100`)
- `OUTPUT_TTL_HOURS`: cleanup old artifacts in `web-output` (default `24`)
- `WECHAT_APPID`: WeChat official account appid (required for `outputMode=wechat`)
- `WECHAT_SECRET`: WeChat official account secret (required for `outputMode=wechat`)
- `WECHAT_THUMB_MEDIA_ID`: cover image media id for draft/add (required for `outputMode=wechat`)
- `WECHAT_DEFAULT_AUTHOR`: default article author (optional)
- `WECHAT_DEFAULT_SOURCE_URL`: default content source url (optional)
- `WECHAT_AUTO_PUBLISH`: default auto publish behavior, `true|false` (optional)

When `outputMode=wechat`, optional form fields:

- `wechatTitle`: article title override
- `wechatAuthor`: article author override
- `wechatSourceUrl`: article source URL override
- `wechatDigest`: article digest override (<=120 chars recommended)
- `wechatAutoPublish`: `true|false`, whether to call `freepublish/submit`

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

Railway env template: `.env.railway.example`
