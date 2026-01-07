// Vercel Serverless Function for 2D floor plan room detection using Gemini Vision
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Use Gemini Flash for fast, cost-effective vision analysis
const VISION_MODEL = 'google/gemini-2.0-flash-001';

const ROOM_DETECTION_PROMPT = `Look at this floor plan. For each room, I need you to:

STEP 1: Describe each room's shape
- Is it rectangular (4 corners)?
- Is it L-shaped (6 corners)?
- Is it irregular (count the corners)?

STEP 2: Trace the boundary as an SVG path
- Use percentages of image size (0-100)
- M = move to start, L = line to next point
- Go clockwise from top-left corner
- Add a point at EVERY corner/turn

Example for an L-shaped room:
{"label": "Living Room", "shape": "L-shaped, 6 corners", "path": "M 15,20 L 35,20 L 35,40 L 25,40 L 25,55 L 15,55 Z"}

Example for a rectangular room:
{"label": "Bedroom", "shape": "rectangular, 4 corners", "path": "M 40,10 L 60,10 L 60,35 L 40,35 Z"}

RULES:
- Count corners carefully - L-shaped = 6, T-shaped = 8, rectangular = 4
- Stay inside the floor plan drawing (ignore white margins)
- Follow wall lines exactly

Return ONLY a JSON array:
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

    // Call Gemini Vision via OpenRouter
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
        max_tokens: 2048,
        temperature: 0.1 // Low temperature for consistent structured output
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

    const content = data.choices[0].message.content;

    // Extract JSON from response (handle potential markdown code blocks)
    let jsonStr = content;
    if (typeof content === 'string') {
      // Remove markdown code blocks if present
      jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    }

    // Parse the JSON response
    let roomsData;
    try {
      roomsData = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse room detection response:', content);
      return res.status(500).json({ error: 'Failed to parse room detection response' });
    }

    if (!Array.isArray(roomsData)) {
      return res.status(500).json({ error: 'Invalid room detection format' });
    }

    // Parse SVG path to polygon points
    function parseSvgPath(pathStr) {
      if (!pathStr) return [];
      const points = [];
      // Match M/L followed by coordinates (handles "M 10,20" or "M10,20" or "M 10 20")
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

    // Convert to DetectedRoom format
    const rooms = roomsData.map((room, index) => {
      // Try SVG path first, fall back to polygon array
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

      // Calculate bounding box from polygon
      let minX = 100, minY = 100, maxX = 0, maxY = 0;
      for (const pt of polygon) {
        minX = Math.min(minX, pt.x);
        minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x);
        maxY = Math.max(maxY, pt.y);
      }

      // Fallback if polygon is empty or invalid
      if (polygon.length < 3) {
        console.warn(`Room ${room.label} has invalid polygon, skipping`);
        return null;
      }

      return {
        id: `room-${index}`,
        label: room.label || `Room ${index + 1}`,
        confidence: 0.9,
        shape: room.shape || 'unknown',
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
    }).filter(Boolean); // Remove any null entries

    return res.status(200).json({
      rooms,
      imageWidth: 100, // Percentages
      imageHeight: 100
    });

  } catch (error) {
    console.error('Room detection error:', error);
    return res.status(500).json({ error: error.message || 'Room detection failed' });
  }
}
