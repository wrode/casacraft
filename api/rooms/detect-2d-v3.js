// V3: Room detection using Claude Vision instead of Gemini
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Claude 3.5 Sonnet for vision tasks
const VISION_MODEL = 'anthropic/claude-3.5-sonnet';

const ROOM_DETECTION_PROMPT = `Look at this 2D floor plan image. I need you to trace the exact boundary of each room.

For each room:
1. Identify the room type (Bedroom, Living Room, Kitchen, Bathroom, Hallway, Balcony, etc.)
2. Trace its boundary by listing polygon points as percentages of the image (0-100)
3. Follow the WALLS exactly - add a point at every corner where walls turn

IMPORTANT:
- Most rooms are NOT rectangular. An L-shaped room needs 6 points, not 4.
- Walk along the interior wall line, adding a vertex at each corner.
- Stay within the floor plan drawing area (ignore white margins, text, logos).
- Points should go clockwise starting from the top-left corner of each room.

Example for an L-shaped room:
{"label": "Living Room", "polygon": [
  {"x": 20, "y": 15}, {"x": 40, "y": 15}, {"x": 40, "y": 35},
  {"x": 30, "y": 35}, {"x": 30, "y": 50}, {"x": 20, "y": 50}
]}

Output ONLY a JSON array with all rooms, no other text:
[{"label": "Room Name", "polygon": [{"x": ..., "y": ...}, ...]}]`;

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

    const rooms = roomsData.map((room, index) => {
      const polygon = (room.polygon || []).map(pt => ({
        x: Math.max(0, Math.min(100, pt.x || 0)),
        y: Math.max(0, Math.min(100, pt.y || 0))
      }));

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
