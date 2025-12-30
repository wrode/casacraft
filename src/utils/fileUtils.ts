import type { FileValidation } from '../types';

// Supported file types
const SUPPORTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/avif'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MIN_DIMENSION = 800; // Minimum 800px on shortest side
const MAX_DIMENSION = 4096; // Maximum 4096px on longest side

/**
 * Validates an uploaded file for type, size, and dimensions
 */
export async function validateFile(file: File): Promise<FileValidation> {
  // Check file type
  if (!SUPPORTED_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Ugyldig filtype. Støttede formater: PNG, JPEG, AVIF`
    };
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `Filen er for stor (${sizeMB} MB). Maksimal størrelse er 10 MB`
    };
  }

  // Load image to check dimensions
  try {
    const { dataUrl, width, height } = await loadImageFile(file);

    const shortSide = Math.min(width, height);
    const longSide = Math.max(width, height);

    if (shortSide < MIN_DIMENSION) {
      return {
        valid: false,
        error: `Bildet er for lite (${width}x${height}). Minste side må være ${MIN_DIMENSION}px`
      };
    }

    if (longSide > MAX_DIMENSION) {
      // We'll resize this, so it's not an error
      console.log(`Image will be resized from ${width}x${height}`);
    }

    return {
      valid: true,
      file,
      dataUrl,
      width,
      height
    };
  } catch (err) {
    return {
      valid: false,
      error: 'Kunne ikke lese bildefilen. Prøv en annen fil.'
    };
  }
}

/**
 * Loads a file and returns its data URL and dimensions
 */
export function loadImageFile(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();

      img.onload = () => {
        resolve({
          dataUrl,
          width: img.width,
          height: img.height
        });
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      img.src = dataUrl;
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Normalizes an image by resizing if needed and converting to PNG
 */
export async function normalizeImage(
  dataUrl: string,
  maxSize: number = 2048
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      let { width, height } = img;

      // Calculate new dimensions if needed
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      // Create canvas and draw resized image
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      // White background for transparent PNGs
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // Draw image
      ctx.drawImage(img, 0, 0, width, height);

      // Return as PNG
      resolve(canvas.toDataURL('image/png', 0.9));
    };

    img.onerror = () => {
      reject(new Error('Failed to load image for normalization'));
    };

    img.src = dataUrl;
  });
}

/**
 * Rotates an image by the specified degrees (90, 180, 270)
 */
export async function rotateImage(
  dataUrl: string,
  degrees: 90 | 180 | 270
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      // Set canvas size based on rotation
      if (degrees === 90 || degrees === 270) {
        canvas.width = img.height;
        canvas.height = img.width;
      } else {
        canvas.width = img.width;
        canvas.height = img.height;
      }

      // Move to center, rotate, then draw
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((degrees * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = () => {
      reject(new Error('Failed to load image for rotation'));
    };

    img.src = dataUrl;
  });
}

/**
 * Generates a unique ID for projects
 */
export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Generates a secret token for project deletion
 */
export function generateSecretToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Gets or creates a client ID stored in localStorage
 */
export function getOrCreateClientId(): string {
  const key = 'homevision_client_id';
  let clientId = localStorage.getItem(key);

  if (!clientId) {
    clientId = generateId();
    localStorage.setItem(key, clientId);
  }

  return clientId;
}
