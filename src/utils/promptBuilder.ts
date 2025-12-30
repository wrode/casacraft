import type { Annotation, StylePreset, StyleConfig } from '../types';

// Base prompt from SPEC
const BASE_PROMPT = `Top-down, fully 3D isometric render of the entire floor plan. Create a clean, highly detailed miniature architectural maquette with accurate room proportions and layout, matching the reference exactly.

CRITICAL - ORIENTATION:
- The 3D render MUST maintain the EXACT SAME orientation as the input floor plan
- If the entrance is at the bottom of the floor plan, it must be at the bottom of the render
- Do NOT rotate or mirror the layout - north stays north, the view angle must preserve the original orientation
- Match the aspect ratio and proportions exactly as shown

CRITICAL - DOORS AND OPENINGS:
- Carefully identify ALL doors and doorways shown in the floor plan (typically shown as gaps in walls with arc swings or rectangular openings)
- Every door between rooms MUST be rendered as an open doorway or visible door
- Interior doors connecting rooms are essential - do not fill them in with walls
- Pay special attention to doors between: bedrooms and hallways, kitchen and living areas, bathrooms

WALLS AND STRUCTURE:
- Preserve exact wall positions and thicknesses from the floor plan
- Do not add walls where there are none in the original
- Do not remove or block any openings shown in the plan

CRITICAL - NO TEXT OR LABELS:
- Do NOT include ANY text, labels, room names, or annotations in the output image
- Remove all text that appears in the input floor plan
- The output must be a pure 3D render with NO overlaid text whatsoever
- No room labels, no dimension text, no watermarks, no captions

FURNISHING:
Include appropriate furniture and decorative objects in each room—sofas, beds, tables, cabinets, lamps, plants, rugs, appliances—arranged realistically and in scale.

QUALITY:
High-resolution, photorealistic materials (wood floors, tiles, fabrics, glass). Soft global lighting, subtle shadows, crisp edges. Professional, polished, high-quality output.`;

// Style configurations
export const STYLE_CONFIGS: StyleConfig[] = [
  {
    value: 'modern',
    label: 'Moderne minimalistisk',
    description: 'Rene linjer, nøytrale farger, minimalt med dekor',
    promptSuffix: 'Modern minimalist style. Sleek, contemporary furniture with clean lines. Neutral color palette (white, gray, black, beige). Minimal decorations. Low-profile sofas, simple dining tables, platform beds. Contemporary Scandinavian influence.'
  },
  {
    value: 'scandinavian',
    label: 'Skandinavisk koselig',
    description: 'Varme toner, tre, tekstiler og hygge',
    promptSuffix: 'Warm Scandinavian hygge style. Light wood furniture (oak, birch), cozy textiles (wool throws, sheepskin rugs), soft lighting, many plants, warm neutral tones. Comfortable sofas with cushions, wooden dining sets. Inviting and cozy atmosphere.'
  },
  {
    value: 'industrial',
    label: 'Industriell loft',
    description: 'Rå materialer, metall, eksponert murstein',
    promptSuffix: 'Industrial loft style. Metal and reclaimed wood furniture, leather sofas, exposed brick textures, dark wood floors. Edison bulb lighting, metal shelving, raw materials. Urban warehouse aesthetic with character.'
  },
  {
    value: 'traditional',
    label: 'Tradisjonell elegant',
    description: 'Klassisk design, rike farger, ornamenterte detaljer',
    promptSuffix: 'Traditional elegant style. Classic wooden furniture with ornate details, rich upholstery in burgundy, navy, and forest green. Antique-style pieces, carved wood details, elegant chandeliers, Persian rugs, crown molding. Timeless sophistication and warmth.'
  },
  {
    value: 'colorful',
    label: 'Fargerik leken',
    description: 'Levende farger, mønstrede tekstiler, kreativ',
    promptSuffix: 'Playful colorful style. Vibrant, bold colors throughout. Patterned textiles, eclectic furniture mix, creative artistic touches. Bright sofas, colorful accent chairs, fun decorative objects. Energetic and cheerful atmosphere.'
  }
];

/**
 * Gets the style configuration for a given preset
 */
export function getStyleConfig(style: StylePreset): StyleConfig {
  return STYLE_CONFIGS.find(s => s.value === style) || STYLE_CONFIGS[0];
}

/**
 * Builds the complete prompt from annotations and style
 */
export function buildPrompt(annotations: Annotation[], style: StylePreset): string {
  const styleConfig = getStyleConfig(style);

  let prompt = BASE_PROMPT;

  // Add style suffix
  prompt += `\n\nStyle: ${styleConfig.promptSuffix}`;

  // Add room labels if any
  const labels = annotations.filter(a => a.type === 'label' && a.text);
  if (labels.length > 0) {
    const roomList = labels.map(l => l.text).join(', ');
    prompt += `\n\nRoom labels identified: ${roomList}. Furnish each room appropriately for its function.`;
  }

  // Add keep markers
  const keepAreas = annotations.filter(a => a.type === 'keep');
  if (keepAreas.length > 0) {
    prompt += `\n\nAreas marked to KEEP AS-IS: Preserve the layout and features in ${keepAreas.length} marked region(s).`;
  }

  // Add change markers
  const changeAreas = annotations.filter(a => a.type === 'change');
  if (changeAreas.length > 0) {
    const changeNotes = changeAreas
      .filter(a => a.text)
      .map(a => a.text)
      .join('; ');
    prompt += `\n\nAreas marked for CHANGE: Apply modifications to ${changeAreas.length} marked region(s).`;
    if (changeNotes) {
      prompt += ` Notes: ${changeNotes}`;
    }
  }

  // Add arrow annotations
  const arrows = annotations.filter(a => a.type === 'arrow' && a.text);
  if (arrows.length > 0) {
    const arrowNotes = arrows.map(a => a.text).join('; ');
    prompt += `\n\nUser notes: ${arrowNotes}`;
  }

  return prompt;
}

/**
 * Builds a refinement prompt for regenerating with feedback
 */
export function buildRefinementPrompt(
  annotations: Annotation[],
  style: StylePreset,
  feedback: string
): string {
  const styleConfig = getStyleConfig(style);

  return `You are making a SMALL, TARGETED modification to an isometric apartment render.

CRITICAL - KEEP EVERYTHING THE SAME EXCEPT:
- Only change elements WHERE the user has drawn RED ANNOTATIONS
- Everything else must be PIXEL-PERFECT identical to the previous image

DO NOT CHANGE:
- Walls, doors, windows - keep exactly the same
- Room layout and proportions - keep exactly the same
- Overall composition, colors, style - keep exactly the same
- Any area WITHOUT red annotations - keep exactly the same

USER'S REQUEST (shown as red marks on the image):
${feedback}

STYLE: ${styleConfig.promptSuffix}

OUTPUT REQUIREMENTS:
1. Top-down isometric view - exactly like the input
2. The red annotations should NOT appear in output - they are instructions only
3. Match the exact style of the original render
4. Minimal change - 95%+ of the image stays identical`;
}

/**
 * Extracts annotation descriptions for AI context
 */
export function describeAnnotations(annotations: Annotation[]): string {
  if (annotations.length === 0) return '';

  const descriptions: string[] = [];

  annotations.forEach(a => {
    switch (a.type) {
      case 'label':
        if (a.text) descriptions.push(`Room label: "${a.text}"`);
        break;
      case 'arrow':
        if (a.text) descriptions.push(`Arrow pointing to: "${a.text}"`);
        else descriptions.push('Arrow indicating an area');
        break;
      case 'keep':
        descriptions.push('Marked area to keep unchanged');
        break;
      case 'change':
        if (a.text) descriptions.push(`Area to change: "${a.text}"`);
        else descriptions.push('Area marked for changes');
        break;
      case 'path':
        descriptions.push('Freehand line marking an area');
        break;
    }
  });

  return descriptions.join('. ');
}
