# ABR Oral Board MVP

Web-first MVP scaffold for an ABR oral board practice product.

## What is implemented

- Learner dashboard
- Case library with seeded radiology cases
- Live oral session screen with a typed runtime-backed session loop
- Debrief screen driven by generated session output
- Faculty review screen with transcript audit surface
- Locked product framing where the AI counterpart is always a radiologist examiner
- Local mock API layer that can be swapped for a real backend later

## Runtime foundations added

- Typed domain contracts for cases, sessions, transcript turns, phases, and debriefs
- Seeded case structure shaped around ABR-published oral-exam framing, especially observation, synthesis, and management
- Mock backend/runtime path for:
  - listing cases
  - creating a session
  - submitting learner turns
  - advancing oral-board phases
  - generating a structured debrief
- Front-end wiring so the app is no longer a static UI shell

## Stack

- React
- TypeScript
- Vite
- Hand-authored CSS for a polished dark radiology UI

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Build and lint

```bash
npm run build
npm run lint
```

## Notes

The seeded cases and examiner flow are now loosely grounded in publicly shared ABR oral-exam guidance about realistic case depth, standardized examiner prompts, and rubric-based scoring. This MVP does **not** attempt to reproduce exam content verbatim. It uses that public guidance to shape practical educational case structure.

This is still an MVP, but it now has a practical local runtime seam for the next pass:

- replace the mock API with a real backend
- persist sessions and transcripts
- connect a real examiner/evaluator model
- add routing, auth, and image viewer integration
