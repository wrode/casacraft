// Vercel Serverless Function for 2D floor plan room detection - TWO-PASS approach
// Pass 1: Identify floor plan bounds
// Pass 2: Detect rooms within those bounds
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

const VISION_MODEL = 'google/gemini-2.0-flash-001';

// Pass 1: Find the floor plan bounds
const BOUNDS_DETECTION_PROMPT = `Look at this image containing a 2D floor plan.

Identify the BOUNDING BOX of the actual floor plan drawing (the architectural drawing with walls).
Ignore white margins, text labels, logos, and dimensions that are outside the floor plan.

Return the bounds as percentages of the image dimensions:
- x: left edge of floor plan (0-100)
- y: top edge of floor plan (0-100)
- width: width of floor plan area (0-100)
- height: height of floor plan area (0-100)

Return ONLY valid JSON, no markdown:
{"x": 15, "y": 10, "width": 60, "height": 75}`;

// Pass 2: Detect rooms within bounds (bounds will be inserted)
const ROOM_DETECTION_TEMPLATE = `Analyze this 2D floor plan. The floor plan drawing is at:
- Left: BOUNDS_X%, Top: BOUNDS_Y%, Width: BOUNDS_W%, Height: BOUNDS_H%

Trace the EXACT boundary of each room by following the wall lines.

CRITICAL - POLYGON TRACING:
- Trace the EXACT shape - most rooms are NOT simple rectangles
- Walk along each wall, adding a point at every corner/turn
- L-shaped rooms need 6 points, T-shaped need 8 points, etc.
- Start top-left, go clockwise
- Add a point at EVERY corner where walls change direction

For each room provide:
- label: Room type in English
- polygon: Array of {x, y} points as percentages (0-100) of FULL image

EXAMPLE - L-shaped room with 6 points:
{"label": "Living Room", "polygon": [
  {"x": 15, "y": 20}, {"x": 35, "y": 20}, {"x": 35, "y": 40},
  {"x": 25, "y": 40}, {"x": 25, "y": 55}, {"x": 15, "y": 55}
]}

RULES:
- ALL points must be within the floor plan bounds above
- Follow BLACK WALL LINES exactly
- Minimum 4 points, MORE for complex shapes
- No overlapping rooms

Return ONLY valid JSON array:
[{"label": "...", "polygon": [...]}]`;

async function callVisionAPI(apiKey, imageData, prompt, referer) {
  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': referer || 'https://casacraft.vercel.app',
      'X-Title': 'Beautiful Room'
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: imageData.startsWith('data:')
                  ? imageData
                  : `data:image/png;base64,${imageData}`
              }
            }
          ]
        }
      ],
      max_tokens: 2048,
      temperature: 0.1
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Vision API error: ${error}`);
  }

  const data = await response.json();
  if (!data.choices || data.choices.length === 0) {
    throw new Error('No response from vision model');
  }

  let content = data.choices[0].message.content;
  if (typeof content === 'string') {
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  }

  return JSON.parse(content);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OpenRouter API key not configured' });
  }

  try {
    const { imageData } = req.body;

    if (!imageData) {
      return res.status(400).json({ error: 'Missing imageData' });
    }

    const referer = req.headers.referer;

    // PASS 1: Detect floor plan bounds
    console.log('Pass 1: Detecting floor plan bounds...');
    let bounds;
    try {
      bounds = await callVisionAPI(apiKey, imageData, BOUNDS_DETECTION_PROMPT, referer);
      console.log('Detected bounds:', bounds);
    } catch (err) {
      console.error('Bounds detection failed:', err);
      // Fallback to full image
      bounds = { x: 0, y: 0, width: 100, height: 100 };
    }

    // PASS 2: Detect rooms within bounds
    console.log('Pass 2: Detecting rooms within bounds...');
    const roomPrompt = ROOM_DETECTION_TEMPLATE
      .replace('BOUNDS_X', bounds.x || 0)
      .replace('BOUNDS_Y', bounds.y || 0)
      .replace('BOUNDS_W', bounds.width || 100)
      .replace('BOUNDS_H', bounds.height || 100);

    const roomsData = await callVisionAPI(apiKey, imageData, roomPrompt, referer);

    if (!Array.isArray(roomsData)) {
      return res.status(500).json({ error: 'Invalid room detection format' });
    }

    // Convert to DetectedRoom format
    const rooms = roomsData.map((room, index) => {
      const polygon = (room.polygon || []).map(pt => ({
        x: Math.max(0, Math.min(100, pt.x || 0)),
        y: Math.max(0, Math.min(100, pt.y || 0))
      }));

      // Calculate bounding box from polygon
      let minX = 100, minY = 100, maxX = 0, maxY = 0;
      for (const pt of polygon) {
        minX = Math.min(minX, pt.x);
        minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x);
        maxY = Math.max(maxY, pt.y);
      }

      if (polygon.length < 3) {
        console.warn(`Room ${room.label} has invalid polygon, skipping`);
        return null;
      }

      return {
        id: `room-${index}`,
        label: room.label || `Room ${index + 1}`,
        confidence: 0.9,
        bbox: {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY
        },
        polygon,
        maskUrl: null,
        featherPx: 12
      };
    }).filter(Boolean);

    return res.status(200).json({
      rooms,
      bounds, // Include detected bounds for debugging
      imageWidth: 100,
      imageHeight: 100
    });

  } catch (error) {
    console.error('Room detection error:', error);
    return res.status(500).json({ error: error.message || 'Room detection failed' });
  }
}
