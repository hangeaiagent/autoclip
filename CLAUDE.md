# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AutoClip is an AI-powered video clipping system. It downloads videos from YouTube/Bilibili, uses AI (Qwen/DashScope) to analyze content, extracts highlights, and generates clip collections. Frontend-backend separated architecture.

## Common Commands

### Backend
```bash
# Activate venv and set PYTHONPATH (required)
source venv/bin/activate
export PYTHONPATH="${PWD}:${PYTHONPATH}"

# Start backend dev server
python -m uvicorn backend.main:app --reload --port 8000

# Start Celery worker (requires Redis running)
celery -A backend.core.celery_app worker --loglevel=info

# Run tests
cd backend && pytest
cd backend && pytest tests/test_repositories.py  # single file
cd backend && pytest -m unit                      # by marker (unit/integration/slow)
```

### Frontend
```bash
cd frontend
npm install
npm run dev      # dev server on port 3000
npm run build    # tsc && vite build
npm run lint     # eslint
```

### Full System (shell scripts, Linux/macOS)
```bash
./start_autoclip.sh     # full start with checks
./quick_start.sh        # fast dev start
./stop_autoclip.sh      # stop all services
./status_autoclip.sh    # check status
```

### Docker
```bash
./docker-start.sh       # production
./docker-start.sh dev   # development
./docker-stop.sh
./docker-status.sh
```

## Architecture

### Backend (Python/FastAPI)

- **Entry point**: `backend/main.py` — FastAPI app, CORS, startup events, routes
- **API routes**: `backend/api/v1/` — all REST endpoints registered in `__init__.py` via `api_router`, prefixed `/api/v1`
- **Core**: `backend/core/`
  - `config.py` — pydantic-settings based config, reads `.env`
  - `shared_config.py` — video categories, prompt file paths, processing params, `ConfigManager` class
  - `database.py` — SQLAlchemy engine/session (SQLite default, supports PostgreSQL)
  - `celery_app.py` — Celery configuration (Redis broker)
- **Pipeline** (`backend/pipeline/step1-6`): 6-step AI processing pipeline:
  1. `step1_outline` — extract outline from transcript
  2. `step2_timeline` — identify topic time ranges
  3. `step3_scoring` — score segments for quality
  4. `step4_title` — generate titles for clips
  5. `step5_clustering` — cluster topics into collections
  6. `step6_video` — generate clip/collection videos (FFmpeg)
- **Processing orchestrator**: `backend/services/processing_orchestrator.py` — coordinates pipeline execution and task state
- **Models**: `backend/models/` — SQLAlchemy models (Project, Clip, Collection, Task, BilibiliAccount)
- **Repositories**: `backend/repositories/` — data access layer with base repository pattern
- **Services**: `backend/services/` — business logic (processing, progress tracking, upload queue, etc.)
- **Tasks**: `backend/tasks/` — Celery async tasks (processing, upload, maintenance, video)
- **Utils**: `backend/utils/` — LLM client, video editor, speech recognizer, bilibili downloader, etc.

### Frontend (React 18 + TypeScript + Vite)

- **Entry**: `frontend/src/main.tsx` → `App.tsx` (3 routes: `/`, `/project/:id`, `/settings`)
- **Pages**: `frontend/src/pages/` — HomePage, ProjectDetailPage, SettingsPage
- **Components**: `frontend/src/components/` — ClipCard, CollectionCard, UploadModal, SubtitleEditor, etc.
- **API client**: `frontend/src/services/api.ts` — axios instance targeting `localhost:8000/api/v1`
- **State**: `frontend/src/store/useProjectStore.ts` (Zustand), plus `stores/` for progress
- **Vite config**: proxy `/api` to backend; path alias `@` → `src/`; port 3000

### Prompt Templates

`prompt/` directory contains per-category prompt templates (大纲, 时间点, 标题生成, 主题聚类, 推荐理由). Categories: default, knowledge, business, opinion, experience, speech, content_review, entertainment. Falls back to root prompts if category-specific ones don't exist.

### Data Flow

Video URL/Upload → Download (yt-dlp/bilibili API) → Speech Recognition (SRT) → 6-step AI Pipeline → Clips + Collections stored in `data/projects/{id}/`

## Key Conventions

- Backend code is all under `backend/` package — imports use `backend.xxx` or relative imports
- Configuration has two systems: `backend/core/config.py` (pydantic-settings, `.env`) and `backend/core/shared_config.py` (legacy constants + ConfigManager). Both coexist.
- AI model: Qwen (通义千问) via DashScope API. Key env var: `API_DASHSCOPE_API_KEY`
- Database: SQLite at `data/autoclip.db` (default), session via `get_db()` dependency injection
- Async tasks go through Celery with Redis broker (`REDIS_URL`)
- Commit messages follow conventional commits: `feat(scope): description`, `fix(scope): description`
- Backend follows PEP 8; frontend uses ESLint + TypeScript strict mode

## Environment

Requires: Python 3.8+, Node.js 16+, Redis 6+, FFmpeg. Config via `.env` file (copy from `env.example`).
