// V3: Room detection using Claude Vision instead of Gemini
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Claude 3.5 Sonnet for vision tasks
const VISION_MODEL = 'anthropic/claude-3.5-sonnet';

const ROOM_DETECTION_PROMPT = `Analyze this floor plan image. For each room:

1. FIRST, describe its shape:
   - "rectangular" = 4 corners
   - "L-shaped" = 6 corners
   - "T-shaped" = 8 corners
   - etc.

2. THEN, trace its boundary as an SVG path string using percentages (0-100):
   - M = start point
   - L = line to next corner
   - Z = close path
   - Go clockwise from top-left

EXAMPLES:

L-shaped room (6 corners):
{"label": "Living Room", "shape": "L-shaped", "path": "M 15,20 L 35,20 L 35,40 L 25,40 L 25,55 L 15,55 Z"}

Rectangular room (4 corners):
{"label": "Bedroom", "shape": "rectangular", "path": "M 40,10 L 60,10 L 60,35 L 40,35 Z"}

CRITICAL:
- Count the actual corners in the floor plan for each room
- L-shaped rooms MUST have 6 points, not 4
- Stay inside the floor plan drawing, ignore margins
- Follow the black wall lines exactly

Output ONLY valid JSON array:
[{"label": "...", "shape": "...", "path": "M ... Z"}]`;

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

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': req.headers.referer || 'https://casacraft.vercel.app',
        'X-Title': 'Beautiful Room'
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: ROOM_DETECTION_PROMPT },
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
        max_tokens: 4096,
        temperature: 0
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenRouter API error:', error);
      return res.status(response.status).json({ error: `Vision API error: ${error}` });
    }

    const data = await response.json();

    if (!data.choices || data.choices.length === 0) {
      return res.status(500).json({ error: 'No response from vision model' });
    }

    let content = data.choices[0].message.content;
    if (typeof content === 'string') {
      content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    }

    let roomsData;
    try {
      roomsData = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse response:', content);
      return res.status(500).json({ error: 'Failed to parse room detection response' });
    }

    if (!Array.isArray(roomsData)) {
      return res.status(500).json({ error: 'Invalid room detection format' });
    }

    // Parse SVG path to polygon points
    function parseSvgPath(pathStr) {
      if (!pathStr) return [];
      const points = [];
      const regex = /([ML])\s*(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/gi;
      let match;
      while ((match = regex.exec(pathStr)) !== null) {
        points.push({
          x: Math.max(0, Math.min(100, parseFloat(match[2]))),
          y: Math.max(0, Math.min(100, parseFloat(match[3])))
        });
      }
      return points;
    }

    const rooms = roomsData.map((room, index) => {
      let polygon;
      if (room.path) {
        polygon = parseSvgPath(room.path);
      } else if (room.polygon) {
        polygon = (room.polygon || []).map(pt => ({
          x: Math.max(0, Math.min(100, pt.x || 0)),
          y: Math.max(0, Math.min(100, pt.y || 0))
        }));
      } else {
        polygon = [];
      }

      let minX = 100, minY = 100, maxX = 0, maxY = 0;
      for (const pt of polygon) {
        minX = Math.min(minX, pt.x);
        minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x);
        maxY = Math.max(maxY, pt.y);
      }

      if (polygon.length < 3) return null;

      return {
        id: `room-${index}`,
        label: room.label || `Room ${index + 1}`,
        confidence: 0.9,
        shape: room.shape || 'unknown',
        bbox: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
        polygon,
        maskUrl: null,
        featherPx: 12
      };
    }).filter(Boolean);

    return res.status(200).json({
      rooms,
      method: 'v3-claude',
      imageWidth: 100,
      imageHeight: 100
    });

  } catch (error) {
    console.error('Room detection error:', error);
    return res.status(500).json({ error: error.message || 'Room detection failed' });
  }
}
