// V4: Room-by-room detection - first identify rooms, then trace each one separately
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

const VISION_MODEL = 'google/gemini-2.0-flash-001';

// Step 1: Identify rooms and their approximate centers
const IDENTIFY_ROOMS_PROMPT = `Look at this 2D floor plan. List all the rooms you can identify.

For each room, provide:
- label: The room type (Bedroom, Living Room, Kitchen, Bathroom, Hallway, Balcony, etc.)
- center: Approximate center point as {x, y} percentages (0-100) of the image
- shape: Brief description (e.g., "rectangular", "L-shaped", "irregular")

Output ONLY a JSON array:
[{"label": "Living Room", "center": {"x": 30, "y": 40}, "shape": "L-shaped"}]`;

// Step 2: Trace a specific room (template - room name will be inserted)
const TRACE_ROOM_TEMPLATE = `Look at this 2D floor plan. Focus ONLY on the ROOM_NAME located near coordinates (CENTER_X%, CENTER_Y%).

Trace the EXACT boundary of this room by following its walls. The room is described as: ROOM_SHAPE.

CRITICAL:
- Add a point at EVERY corner where walls turn
- If it's L-shaped, you need 6 points
- If rectangular, 4 points
- Follow the interior wall lines exactly
- Coordinates are percentages (0-100) of the image

Output ONLY a JSON object with the polygon points, clockwise from top-left:
{"polygon": [{"x": 20, "y": 15}, {"x": 40, "y": 15}, ...]}`;

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
    throw new Error(`Vision API error: ${await response.text()}`);
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

    // Step 1: Identify all rooms
    console.log('V4 Step 1: Identifying rooms...');
    const roomsList = await callVisionAPI(apiKey, imageData, IDENTIFY_ROOMS_PROMPT, referer);

    if (!Array.isArray(roomsList) || roomsList.length === 0) {
      return res.status(500).json({ error: 'No rooms identified' });
    }

    console.log(`Found ${roomsList.length} rooms, tracing each...`);

    // Step 2: Trace each room individually (in parallel, max 4 at a time)
    const rooms = [];

    // Process rooms in batches of 4 to avoid rate limits
    for (let i = 0; i < roomsList.length; i += 4) {
      const batch = roomsList.slice(i, i + 4);

      const batchResults = await Promise.all(
        batch.map(async (room, batchIndex) => {
          const index = i + batchIndex;
          try {
            const prompt = TRACE_ROOM_TEMPLATE
              .replace('ROOM_NAME', room.label)
              .replace('CENTER_X', room.center?.x || 50)
              .replace('CENTER_Y', room.center?.y || 50)
              .replace('ROOM_SHAPE', room.shape || 'rectangular');

            const result = await callVisionAPI(apiKey, imageData, prompt, referer);

            const polygon = (result.polygon || []).map(pt => ({
              x: Math.max(0, Math.min(100, pt.x || 0)),
              y: Math.max(0, Math.min(100, pt.y || 0))
            }));

            if (polygon.length < 3) return null;

            let minX = 100, minY = 100, maxX = 0, maxY = 0;
            for (const pt of polygon) {
              minX = Math.min(minX, pt.x);
              minY = Math.min(minY, pt.y);
              maxX = Math.max(maxX, pt.x);
              maxY = Math.max(maxY, pt.y);
            }

            return {
              id: `room-${index}`,
              label: room.label,
              confidence: 0.9,
              bbox: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
              polygon,
              shape: room.shape,
              maskUrl: null,
              featherPx: 12
            };
          } catch (err) {
            console.error(`Failed to trace ${room.label}:`, err);
            return null;
          }
        })
      );

      rooms.push(...batchResults.filter(Boolean));
    }

    return res.status(200).json({
      rooms,
      method: 'v4-room-by-room',
      imageWidth: 100,
      imageHeight: 100
    });

  } catch (error) {
    console.error('Room detection error:', error);
    return res.status(500).json({ error: error.message || 'Room detection failed' });
  }
}
