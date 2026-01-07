// Vercel Serverless Function for 2D floor plan room detection using Gemini Vision
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Use Gemini Flash for fast, cost-effective vision analysis
const VISION_MODEL = 'google/gemini-2.0-flash-001';

const ROOM_DETECTION_PROMPT = `Analyze this 2D floor plan image. Identify all distinct rooms/spaces and trace their boundaries.

For each room, provide:
- label: The room type (Living Room, Kitchen, Bedroom, Bathroom, Hallway, Dining Room, Office, Closet, Balcony, etc.)
- polygon: Array of points tracing the room boundary, as percentages of image dimensions (0-100)
  - Each point is {x, y} where x is percentage from left, y is percentage from top
  - Trace along the INTERIOR walls of each room
  - Use 4-8 points to accurately capture the room shape
  - Points should go clockwise starting from top-left corner

Important:
- Include ALL rooms visible in the floor plan
- Polygons should follow the actual wall boundaries precisely
- Do NOT include space outside the floor plan drawing
- Rooms should NOT overlap - each polygon covers only its own room
- Use standard room names in English

Return ONLY valid JSON array, no markdown, no explanation:
[{"label": "Living Room", "polygon": [{"x": 10, "y": 20}, {"x": 40, "y": 20}, {"x": 40, "y": 55}, {"x": 10, "y": 55}]}]`;

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

    // Convert to DetectedRoom format
    const rooms = roomsData.map((room, index) => {
      // Parse polygon points, clamping to valid range
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

      // Fallback if polygon is empty or invalid
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
