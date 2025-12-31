import type { RoomDetectionResult, DetectedRoom, InpaintResult, BoundingBox } from '../types';

// API URLs - use serverless function in production, direct API in development
const DETECT_URL = import.meta.env.DEV
  ? '/api/rooms/detect'
  : '/api/rooms/detect';

const INPAINT_URL = import.meta.env.DEV
  ? '/api/rooms/inpaint'
  : '/api/rooms/inpaint';

/**
 * Detect rooms in an image
 */
export async function detectRooms(imageUrl: string): Promise<RoomDetectionResult> {
  const response = await fetch(DETECT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ imageUrl })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Room detection failed: ${error}`);
  }

  return response.json();
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
