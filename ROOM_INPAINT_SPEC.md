# Room-Level Automatic Detection and Localized Inpaint (Hosted)

## Goals

- Auto-detect rooms on the full image (no manual masks).
- Let users pick a room and update only that region; keep the rest unchanged.
- Hosted-only (no local GPU); favor simple, swappable providers.

## Provider Recommendation

- **Detection + mask refinement**: Replicate indoor/room panoptic/semantic segmentation, then SAM2 refinement (also on Replicate). Single provider, simple REST, easy to swap models.
- **Inpaint**:
  - Fastest integration: Replicate SDXL-inpaint.
  - Higher fidelity option: Stability AI SDXL-inpaint endpoint.

## Detection Pipeline (Hosted)

1. **Full-image segmentation (Replicate)**  
   Input: `image_url`  
   Output per room: `{id, label, confidence, polygon|rle_mask, bbox}`
2. **Mask refinement (SAM2 on Replicate)**  
   Input: `image_url`, `bbox` (or points) from step 1  
   Output: `refined_mask_url` (binary PNG)
3. **Post-process**
   - Simplify polygon; slight dilation.
   - Store `featherPx` (8–16px) for edge blending at composite.
4. **Cache** per source image; rerun only if the base image changes.

## Inpaint Pipeline (Per Room Edit)

1. On room click, take stored `bbox`, add padding (10–30px), crop image + mask to that region.
2. Call hosted inpaint:
   - Replicate SDXL-inpaint **or** Stability SDXL-inpaint.
   - Payload: `{image: cropped_image_url, mask: cropped_mask_url, prompt, negative_prompt?, guidance_scale?, steps?, seed?, strength?}`
3. Receive inpainted crop; composite back at original coordinates.
   - Feather edges (`featherPx`); if seams appear, run a narrow seam-fix inpaint along the border.
4. Modes: preview (downscaled, fewer steps) vs render (full-res, more steps).

## API Contract (Server Layer)

- `POST /rooms/detect`  
  Body: `{imageUrl}`  
  Returns: `{rooms:[{id,label,confidence,bbox:{x,y,w,h}, polygon, maskUrl, featherPx}]}`
- `POST /rooms/inpaint`  
  Body: `{imageUrl, roomId, bbox, maskUrl, prompt, strength, seed}`  
  Server duties: crop+pad, call inpaint provider, composite, store and return `{cropUrl, fullImageUrl, roomId}`.

## Data Model Additions

- `rooms: [{id, label, confidence, polygon, bbox, maskUrl, featherPx}]`
- `currentEdit: {roomId, prompt, strength, seed, previewUrl, finalUrl}`
- Optional: per-room history for revert.

## UX Notes

- Overlay clickable polygons on the full image; on click, zoom to bbox and show mask.
- Optional quick add/subtract brush for minor fixes; default is auto mask.
- Show before/after toggle for the selected room; lock the rest of the image.

## Performance / Quality

- Detect once per image; reuse masks.
- Send only crop+mask to inpaint to reduce latency and cost.
- Pad crops for context; feather edges to hide seams.
- Prefer single-tile-per-room; if a room must be tiled, add overlap and blend.
