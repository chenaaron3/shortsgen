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
# Source breakdown (book/podcast -> nuggets -> N videos)
python generation/scripts/run_source_pipeline.py -f book.txt

# Full pipeline (single raw content)
python generation/scripts/run_pipeline.py -f content.txt

# Generate content
python3 ./generation/scripts/run_pipeline.py -f ./source/atomic-habits/chapter5.txt
# Upload video
python3 ./generation/scripts/upload_youtube.py --cache-key 98932a8ed00e2619
```
