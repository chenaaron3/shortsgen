# shortgen Monorepo Structure

Cursor reference for the SST v3 (Ion) pnpm monorepo layout.

## Folder Map

```text
shortgen/
├── sst.config.ts              # SST v3 infrastructure (VPC, Cluster, Fargate Service)
├── pnpm-workspace.yaml        # pnpm workspaces
├── package.json               # Root workspace config
├── public/                    # Shared Remotion assets (manifest, images, voice)
│   └── shortgen/
├── packages/
│   └── db/                    # Drizzle schema placeholder (wire up later)
│       ├── schema.ts
│       ├── index.ts
│       └── package.json
├── apps/
│   ├── remotion/              # Remotion compositions (src/, remotion.config.ts)
│   │   ├── src/
│   │   ├── package.json
│   │   └── remotion.config.ts
│   └── eval-ui/               # Vite + React eval UI
│       ├── src/
│       ├── public/
│       └── package.json
└── services/
    └── python-generator/      # Python pipeline (Fargate)
        ├── Dockerfile
        ├── scripts/
        ├── configs/
        ├── prompts/
        ├── assets/
        └── requirements.txt
```

## Path Resolution

- **project_root**: Monorepo root (found via pnpm-workspace.yaml or sst.config.ts)
- **video_public**: `project_root/public` (shared; Python writes, Remotion reads)
- **eval_ui_public**: `project_root/apps/eval-ui/public` (or `eval-ui/public` fallback)
- **remotion_app_root**: `project_root/apps/remotion` (for npx remotion render cwd)

## Commands

```bash
pnpm dev          # Remotion Studio
pnpm eval:ui      # Eval UI (Vite)
pnpm pipeline -- pipeline/run_source_pipeline.py -f content.txt -c default --no-breakdown --break prepare
pnpm sst:dev      # SST dev mode
pnpm sst:deploy   # Deploy to AWS
```

## Deferred

- packages/db: Postgres + Drizzle wiring
- sqlacodegen sync script
- Remotion Lambda (will be used later in webapp)
- WebSocket API for progress
