# Home Vision – Spec

## Objective

Generate a photorealistic isometric 3D render of an apartment from a single uploaded floorplan (“plantegning”), letting the user annotate the plan before rendering. Reuse the same AI model/prompting approach as Garden Vision for consistency.

## Phased Plan

- **Phase 0 – Feasibility spike**: Upload a floorplan (PNG/JPEG/PDF page) → display preview → call AI with base prompt to return one isometric render.
- **Phase 1 – Annotate & render (MVP)**: Add lightweight annotation (room labels, keep/remove markers) that feeds structured text into the prompt; show render status, and allow download.
- **Phase 2 – Variants & styles**: Multiple style presets, seeds, and rerenders from the same annotations.
- **Phase 3 – Storage & history**: Persist renders without auth; shareable links; delete/expire policy.
- **Phase 4 – Finn.no ingestion (later)**: Accept a Finn.no listing URL, detect the floorplan image, and run the same pipeline.

## User Roles & Flows

- **Visitor (no auth)**:
  1. Upload one floorplan file (PNG/JPEG; first page of PDF). Max 10 MB; enforce min resolution (e.g., 1200px longest side). Rotate/crop if needed.
  2. Annotate on top of the preview: room labels, arrows/notes, keep/remove markers.
  3. Generate: send base image + structured annotations to AI; show states (idle → uploading → queued → generating → done/error).
  4. Review result: view 2K render, download PNG/JPEG, optionally rerender with tweaks.
  5. Keep/share: render and metadata saved in storage; shareable link includes project id; local history saved in IndexedDB keyed by clientId.

## Functional Requirements (MVP)

- **File input**: Single file; accept PNG/JPEG; accept PDF (use page 1, rasterize server-side). Reject >10 MB or unsupported types; show clear errors.
- **Preview & normalization**: Show the uploaded plan; allow rotate/fit; optionally auto-contrast to improve line visibility.
- **Annotation tools** (minimal):
  - Text labels for room names/types.
  - Arrows/pins for notes.
  - Simple polygon/rect markers tagged as “keep” or “change”.
  - All annotations stored as structured data (not burned into the prompt image); final render prompt removes text labels in the output.
- **Prompt assembly**:
  - Base prompt (see below) + list of room labels + keep/change notes.
  - Optional style preset (default photorealistic modern).
- **Render request**:
  - Call existing AI model (same as Garden Vision) via serverless function.
  - Default resolution: 2K; allow 1K fallback if model rejects size.
  - Timeout/backoff; one in-flight job per client to keep costs predictable.
- **Output**:
  - Display render with zoom.
  - Actions: download PNG, “rerender with tweaks”, copy share link (when persisted).
- **Persistence (no auth)**:
  - Generate `clientId` (UUID in localStorage) and `projectId` (in URL/share link).
  - Store render image in object storage; store metadata (prompt, model, timestamps, original file hash) in a lightweight KV/DB.
  - Local history in IndexedDB for offline recall; remote fetch by `projectId` for share.
- **Deletion & retention**:
  - Expose delete for a project using a secret token stored alongside projectId in localStorage; serverless function checks token.
  - Default retention (e.g., 30 days) for remote assets; local history persists until user clears.

## AI Touchpoints

- **Model**: Same image-generation model used in Garden Vision (swap-able via serverless function).
- **Inputs**: Floorplan image (normalized), optional mask/annotations as text, style preset.
- **Outputs**: Single isometric 3D render (PNG/JPEG).
- **Prompt (initial)**:

```
Top-down, fully 3D isometric render of the entire floor plan. Create a clean, highly detailed miniature architectural maquette with accurate room proportions and layout, matching the reference exactly. Remove all text labels. Keep all walls, doors, furniture, appliances, and rooms properly placed. Use colorful, modern furniture and decorative objects in each room—sofas, beds, tables, cabinets, lamps, plants, rugs, appliances—arranged realistically and in scale. High-resolution, photorealistic materials (wood floors, tiles, fabrics, glass). Soft global lighting, subtle shadows, crisp edges. Professional, polished, high-quality output.
```

Annotations are appended as structured text (e.g., `Room labels: kitchen, living room, bath...`, `Keep walls: polygon A`, `Change: highlight furniture layout in living room`).

## Non-Functional

- Client-first: SolidJS SPA; fast load (<2s first paint on broadband).
- Render latency target: <60s P95; graceful retries.
- Works on desktop first; tablet-friendly later.
- Accessibility: keyboard for annotate/undo; focus states; sufficient contrast.
- Observability: client logging for upload/render errors; minimal analytics.

## Architecture (proposal)

- **Frontend**: SolidJS + TypeScript + Vite; canvas/SVG overlay for annotations; IndexedDB for local history.
- **Serverless (Vercel)**:
  - Edge/function for upload normalization (PDF → PNG, orientation, resize).
  - Edge/function for render requests to the AI model with cost/rate guard.
  - Edge/function for signed URL issuance and metadata persistence.
- **Storage & metadata (no auth)**:
  - Renders and originals: Vercel Blob Storage (or S3) with signed URLs.
  - Metadata: Vercel KV/Postgres (serverless) keyed by projectId; store clientId + secret delete token.
  - Local: IndexedDB cache of recent projects for quick reopen.
- **Sharing**: URL contains projectId; serverless fetches metadata + signed render URL. Delete uses secret token.

## Data Model (MVP sketch)

- `Project`: projectId, clientId (nullable), createdAt, updatedAt, originalFileUrl, renderUrl, renderSize, model, promptHash.
- `Annotation`: projectId, type (label/note/keep/change), geometry (rect/poly), text.
- `EventLog` (optional): projectId, kind (upload/render/retry/delete), timestamps.

## Milestones

- **M0**: Upload + preview + validation; rasterize PDF to PNG server-side.
- **M1**: Annotation overlay + structured extraction; prompt assembly; single render call.
- **M2**: Style presets and multi-variant renders (variants before persistence).
- **M3**: Persist renders to Blob + metadata to KV; shareable link; download.
- **M4**: Rerender from history; retention/deletion path; simple rate guard.
- **M5**: Finn.no ingestion POC (scrape listing, find floorplan image, run pipeline).

## Risks / Unknowns

- Floorplan quality/variability (blurry scans, skewed photos); may need deskew/contrast.
- Model fidelity to measurements; no scale enforcement without explicit dimensions.
- PDF parsing differences; multi-page uploads need clear UX (page 1 only for MVP).
- Cost spikes if rerenders are unlimited; need rate and size guards.
- Security of unauthenticated storage: must use unguessable IDs and per-project delete tokens.

## Storage Strategy (keeping renders without auth)

- Store images in Vercel Blob (private) and issue signed URLs via serverless function.
- Keep a `projectId` + `secretToken` pair; token lives in client localStorage and is required for delete.
- Metadata lives in Vercel KV/Postgres keyed by `projectId`; includes Blob keys.
- Local history in IndexedDB keyed by `clientId` for quick reopening; remote fetch for share links.
- Apply retention (e.g., 30 days) for Blob/KV; purge via scheduled cron (Vercel cron job).

## Next Steps

1. Confirm storage choice (Vercel Blob + KV) and retention period.
2. Finalize annotation schema → prompt mapping.
3. Implement upload → normalize → annotate flow (SolidJS) and the render API.
4. Add persistence (Blob/KV) + share link + delete path.
5. Define cost/rate limits and logging.
