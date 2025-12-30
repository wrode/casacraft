// Style presets for rendering
export type StylePreset =
  | 'modern'
  | 'scandinavian'
  | 'industrial'
  | 'traditional'
  | 'colorful';

// Render state machine
export type RenderState =
  | 'idle'
  | 'uploading'
  | 'queued'
  | 'generating'
  | 'done'
  | 'error';

// View states for the main app
export type ViewState = 'upload' | 'generating' | 'render';

// Annotation types
export type AnnotationType = 'label' | 'arrow' | 'keep' | 'change' | 'path';

export interface Point {
  x: number;
  y: number;
}

export interface Annotation {
  id: number;
  type: AnnotationType;
  // For labels and single-point annotations
  x?: number;
  y?: number;
  // For arrows
  fromX?: number;
  fromY?: number;
  toX?: number;
  toY?: number;
  // For paths and polygons
  points?: Point[];
  // Text content
  text?: string;
}

// Project data model
export interface Project {
  id: string;
  clientId: string;
  secretToken: string;
  originalFileUrl: string;
  originalFileName: string;
  renderUrl?: string;
  annotations: Annotation[];
  style: StylePreset;
  createdAt: number;
  updatedAt: number;
}

// Local project (includes base64 for offline)
export interface LocalProject extends Project {
  originalFileData?: string; // base64 data URL
  renderData?: string; // base64 data URL
}

// File validation result
export interface FileValidation {
  valid: boolean;
  error?: string;
  file?: File;
  dataUrl?: string;
  width?: number;
  height?: number;
}

// AI generation options
export interface GenerationOptions {
  style: StylePreset;
  annotations: Annotation[];
  feedback?: string;
  previousImage?: string;
}

// AI generation result
export interface GenerationResult {
  image: string | null;
  description: string | null;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Style preset configuration
export interface StyleConfig {
  value: StylePreset;
  label: string;
  description: string;
  promptSuffix: string;
}

// Available AI models
export interface AIModel {
  id: string;
  name: string;
  description: string;
}
