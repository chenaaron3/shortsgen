# shortgen

Remotion-based short video generator. Combines AI-generated images and voice with word-level captions.

## Project structure

```
shortgen/
├── src/              # Remotion compositions (ShortVideo, captions)
├── public/           # Static assets, manifest output
├── generation/       # Python pipeline
│   ├── assets/      # Mascot and reference images
│   ├── scripts/     # Script, chunker, images, voice, prepare, render
│   ├── prompts/
│   ├── cache/       # Per-content cache (script, chunks, images, voice)
│   └── requirements.txt
└── package.json     # Remotion deps
```

## Setup

```bash
# Remotion (Node)
npm install

# Generation pipeline (Python)
pip install -r generation/requirements.txt
```

Create a `.env` with `OPENAI_API_KEY`, `ELEVENLABS_API_KEY` as needed.

## Usage

```bash
# Full pipeline (script -> chunks -> images + voice -> prepare -> render)
python generation/scripts/run_pipeline.py -f content.txt
```

Use `--skip-render` to stop after preparing assets; the pipeline will print the manual render command.

### Preview in Remotion Studio

```bash
npx remotion studio
```

Set props: `{ "cacheKey": "d87aa21852dabc8b" }`

## Captions

Captions use **Whisper** (faster-whisper) for word-level timestamps when available. Install with:

```bash
pip install faster-whisper
```

Use `--no-whisper` to fall back to scene-level captions from chunk text.
