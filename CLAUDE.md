# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CRUMPET (Controlled Runtime for Unified Media Prompt Engineering and Timing) is a timeline-based React application for composing precise, image-timed text prompts for AI video generation. Users drop in reference images, place timed markers on a timeline, write prompt fragments per marker, and the app assembles a final text prompt.

The project is specified in `CRUMPET-dev-plan.md`, which is the authoritative source for all feature requirements, interaction details, and edge cases.

## Tech Stack & Build Approach

- **Single-file React `.jsx` artifact** — all code lives in one file
- **Tailwind CSS** — core utility classes only (no compiler, pre-defined classes only)
- **State management** — React hooks only (`useState`/`useReducer`), no external libraries
- **Persistence** — `localStorage` (last session only, serialize full state on every change)
- **Drag & drop** — native HTML5 API
- **Icons** — lucide-react
- **Fonts** — Google Fonts CDN: JetBrains Mono (prompt text/labels), DM Sans (UI chrome)
- **No external dependencies** beyond what's available in the React artifact environment

Build using the **frontend-design skill** — read `/mnt/skills/public/frontend-design/SKILL.md` before starting any UI work.

## Architecture

The entire app is a single React `.jsx` file. Key architectural decisions:

- **Single `useReducer`** recommended for the complex state tree (tabs, markers, images, timeline settings)
- **localStorage persistence**: serialize full state on every change, restore on mount
- **Timeline rendering**: `<canvas>` or pure HTML/CSS — whichever produces cleaner frame-snapping behavior
- **Text box stacking**: when uncollapsed text boxes would overlap, alternate above/below the timeline or vertically offset with connector lines to markers

### State Shape (per tab)

Each tab is an independent workspace containing: images (as data URIs), timeline settings (duration in seconds, frame rate), markers (frame position, assigned image, prompt text, collapsed state), prefix text, and suffix text.

### Output Format

```
[Prefix Prompt]
at frame [N] [Marker 1 Prompt]
at frame [N] [Marker 2 Prompt]
[Suffix Prompt]
```

Markers ordered by frame position ascending. Blank prompts/prefix/suffix are omitted entirely.

## Visual Design

Dark-mode-only industrial aesthetic:
- Background: `#111`, white/gray text, orange `#E8730C` for accents/warnings/active states
- Monospaced fonts for precision, clean sans-serif for UI chrome
- Minimal motion — only functional transitions (marker snapping, text box sliding, hover states)

## Key Constraints

- Images cannot be removed once dropped (v1 simplification)
- Max 10 markers recommended (orange warning above 10)
- Timeline duration range: 4–15 seconds (orange warning outside this)
- Frame rates: 24, 25, 30, 60 fps (orange warning if not 24 or 25)
- Tab naming: default pattern `SH010`, `SH020`, `SH030`, etc.
- No undo/history — only most recent session persisted
