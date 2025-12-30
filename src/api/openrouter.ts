import type { GenerationOptions, GenerationResult, AIModel } from '../types';
import { buildPrompt, buildRefinementPrompt, describeAnnotations } from '../utils/promptBuilder';

// API URL - use serverless function in production, direct API in development
const API_URL = import.meta.env.DEV
  ? 'https://openrouter.ai/api/v1/chat/completions'
  : '/api/generate';

// Available models for apartment visualization
export const AI_MODELS: Record<string, AIModel> = {
  'gemini-3-pro-image': {
    id: 'google/gemini-3-pro-image-preview',
    name: 'Gemini 3 Pro Image',
    description: 'Best quality image generation'
  },
  'gemini-2.5-flash-image': {
    id: 'google/gemini-2.5-flash-image',
    name: 'Gemini 2.5 Flash Image',
    description: 'Fast image generation'
  }
};

/**
 * Generates an isometric 3D render from a floorplan image
 */
export async function generateIsometricRender(
  floorplanImage: string,
  options: GenerationOptions,
  modelKey: string = 'gemini-3-pro-image'
): Promise<GenerationResult> {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;

  // Only require API key in dev mode (serverless function has it in prod)
  if (import.meta.env.DEV && !apiKey) {
    throw new Error('VITE_OPENROUTER_API_KEY not found in environment');
  }

  const model = AI_MODELS[modelKey];
  if (!model) {
    throw new Error(`Unknown model: ${modelKey}`);
  }

  // Build prompt based on options
  let prompt: string;

  if (options.feedback && options.previousImage) {
    // Refinement mode
    prompt = buildRefinementPrompt(options.annotations, options.style, options.feedback);
  } else {
    // Initial generation
    prompt = buildPrompt(options.annotations, options.style);
  }

  // Build content array with text and image(s)
  const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    {
      type: 'text',
      text: prompt
    },
    {
      type: 'image_url',
      image_url: {
        url: floorplanImage.startsWith('data:')
          ? floorplanImage
          : `data:image/png;base64,${floorplanImage}`
      }
    }
  ];

  // Add previous image if doing refinement
  if (options.previousImage) {
    content.push({
      type: 'image_url',
      image_url: {
        url: options.previousImage.startsWith('data:')
          ? options.previousImage
          : `data:image/png;base64,${options.previousImage}`
      }
    });
  }

  // Build headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  // Add auth headers in dev mode
  if (import.meta.env.DEV) {
    headers['Authorization'] = `Bearer ${apiKey}`;
    headers['HTTP-Referer'] = window.location.origin;
    headers['X-Title'] = 'CasaCraft';
  }

  // Make request
  const response = await fetch(API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: model.id,
      messages: [
        {
          role: 'user',
          content
        }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  // Debug: log the full response structure
  console.log('=== OpenRouter Response ===');
  console.log('Full response:', JSON.stringify(data, null, 2).substring(0, 2000));

  if (!data.choices || data.choices.length === 0) {
    console.error('No choices in response:', data);
    throw new Error('No response from AI model');
  }

  const message = data.choices[0].message;
  const responseContent = message.content;

  // Debug: log message structure
  console.log('Message keys:', Object.keys(message));
  console.log('Content type:', typeof responseContent);
  console.log('Content is array:', Array.isArray(responseContent));
  if (Array.isArray(responseContent)) {
    console.log('Content parts:', responseContent.map((p: any) => ({ type: p.type, hasImageUrl: !!p.image_url, hasInlineData: !!p.inline_data })));
  }

  // Parse response to extract image and description
  let generatedImage: string | null = null;
  let description: string | null = null;

  // Handle array content (Gemini format)
  if (Array.isArray(responseContent)) {
    for (const part of responseContent) {
      if (part.type === 'image_url' && part.image_url?.url) {
        generatedImage = part.image_url.url;
      } else if (part.type === 'image' && part.image_url?.url) {
        generatedImage = part.image_url.url;
      } else if (part.image_url) {
        generatedImage = part.image_url.url || part.image_url;
      } else if (part.type === 'text') {
        description = part.text;
      } else if (part.inline_data) {
        generatedImage = `data:${part.inline_data.mime_type};base64,${part.inline_data.data}`;
      } else if (typeof part === 'string') {
        description = (description || '') + part;
      }
    }
  } else if (typeof responseContent === 'string') {
    // Check for base64 image in response
    const base64Match = responseContent.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
    if (base64Match) {
      generatedImage = base64Match[0];
      description = responseContent.replace(base64Match[0], '').trim();
    } else {
      description = responseContent;
    }
  }

  // Check for images array (alternate format)
  if (!generatedImage && message.images && Array.isArray(message.images)) {
    for (const img of message.images) {
      if (img.type === 'image_url' && img.image_url?.url) {
        generatedImage = img.image_url.url;
        break;
      }
    }
  }

  // Check message-level image
  if (!generatedImage && message.image) {
    generatedImage = message.image;
  }

  // Debug: final result
  console.log('=== Parsing Result ===');
  console.log('Image found:', !!generatedImage);
  console.log('Image type:', generatedImage ? (generatedImage.startsWith('data:') ? 'base64' : 'url') : 'none');
  console.log('Image length:', generatedImage?.length || 0);
  console.log('Description:', description?.substring(0, 200));

  if (!generatedImage) {
    console.error('No image extracted! Full message:', JSON.stringify(message, null, 2).substring(0, 3000));
  }

  return {
    image: generatedImage,
    description,
    model: model.name,
    usage: data.usage
  };
}
