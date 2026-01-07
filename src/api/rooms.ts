import type { RoomDetectionResult, DetectedRoom, InpaintResult, BoundingBox } from '../types';

// API URLs for different detection strategies
const DETECT_URLS: Record<DetectionMethod, string> = {
  v1: '/api/rooms/detect-2d',      // Gemini with improved prompts
  v2: '/api/rooms/detect-2d-v2',   // Two-pass bounds detection
  v3: '/api/rooms/detect-2d-v3',   // Claude Vision
  v4: '/api/rooms/detect-2d-v4',   // Room-by-room detection
};

const INPAINT_URL = '/api/rooms/inpaint';

export type DetectionMethod = 'v1' | 'v2' | 'v3' | 'v4';

export const DETECTION_METHODS: { id: DetectionMethod; label: string; description: string }[] = [
  { id: 'v1', label: 'V1 Gemini', description: 'Single pass with Gemini' },
  { id: 'v2', label: 'V2 Two-pass', description: 'Bounds detection first' },
  { id: 'v3', label: 'V3 Claude', description: 'Claude Vision model' },
  { id: 'v4', label: 'V4 Per-room', description: 'Trace each room separately' },
];

/**
 * Detect rooms from a 2D floor plan image using vision AI
 */
export async function detectRoomsFrom2D(
  imageData: string,
  method: DetectionMethod = 'v1'
): Promise<RoomDetectionResult & { method?: string }> {
  const url = DETECT_URLS[method];

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ imageData })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Room detection failed: ${error}`);
  }

  const result = await response.json();
  return { ...result, method };
}

/**
 * Run all detection methods in parallel and return results
 */
export async function detectRoomsAllMethods(
  imageData: string
): Promise<Map<DetectionMethod, RoomDetectionResult | Error>> {
  const results = new Map<DetectionMethod, RoomDetectionResult | Error>();

  const promises = DETECTION_METHODS.map(async ({ id }) => {
    try {
      const result = await detectRoomsFrom2D(imageData, id);
      results.set(id, result);
    } catch (err) {
      results.set(id, err instanceof Error ? err : new Error(String(err)));
    }
  });

  await Promise.all(promises);
  return results;
}

/**
 * @deprecated Use detectRoomsFrom2D instead - detects on original floor plan
 */
export async function detectRooms(imageUrl: string): Promise<RoomDetectionResult> {
  // Redirect to 2D detection
  return detectRoomsFrom2D(imageUrl);
}

/**
 * Inpaint a specific room
 */
export async function inpaintRoom(
  imageUrl: string,
  room: DetectedRoom,
  prompt: string,
  strength: number = 0.8,
  seed?: number
): Promise<InpaintResult> {
  const response = await fetch(INPAINT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      imageUrl,
      roomId: room.id,
      bbox: room.bbox,
      maskUrl: room.maskUrl,
      prompt,
      strength,
      seed
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Inpainting failed: ${error}`);
  }

  return response.json();
}

/**
 * Convert base64 image to blob URL for API calls
 */
export function base64ToObjectUrl(base64: string): string {
  // If already a URL, return as-is
  if (base64.startsWith('http') || base64.startsWith('blob:')) {
    return base64;
  }

  // Convert base64 to blob
  const parts = base64.split(',');
  const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(parts[1]);
  const n = bstr.length;
  const u8arr = new Uint8Array(n);

  for (let i = 0; i < n; i++) {
    u8arr[i] = bstr.charCodeAt(i);
  }

  const blob = new Blob([u8arr], { type: mime });
  return URL.createObjectURL(blob);
}

/**
 * Upload image and get a URL for API calls
 * In production, this would upload to Vercel Blob
 */
export async function uploadImageForProcessing(base64: string): Promise<string> {
  // For development, we'll use the base64 directly
  // In production, upload to blob storage and return URL
  return base64;
}
