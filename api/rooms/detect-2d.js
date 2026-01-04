// Vercel Serverless Function for 2D floor plan room detection using Gemini Vision
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Use Gemini Flash for fast, cost-effective vision analysis
const VISION_MODEL = 'google/gemini-2.0-flash-001';

const ROOM_DETECTION_PROMPT = `Analyze this 2D floor plan image. Identify all distinct rooms/spaces.

For each room, provide:
- label: The room type (Living Room, Kitchen, Bedroom, Bathroom, Hallway, Dining Room, Office, Closet, Balcony, etc.)
- bounds: Bounding box as percentages of image dimensions where x,y is the TOP-LEFT corner
  - x: percentage from left edge (0-100)
  - y: percentage from top edge (0-100)
  - width: percentage of image width (0-100)
  - height: percentage of image height (0-100)

Important:
- Include ALL rooms visible in the floor plan
- Bounding boxes should tightly fit each room
- If rooms overlap or are unclear, make your best estimate
- Use standard room names

Return ONLY valid JSON array, no markdown, no explanation:
[{"label": "Living Room", "bounds": {"x": 10, "y": 15, "width": 35, "height": 40}}]`;

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
      const bounds = room.bounds || {};
      const x = Math.max(0, Math.min(100, bounds.x || 0));
      const y = Math.max(0, Math.min(100, bounds.y || 0));
      const width = Math.max(1, Math.min(100 - x, bounds.width || 20));
      const height = Math.max(1, Math.min(100 - y, bounds.height || 20));

      return {
        id: `room-${index}`,
        label: room.label || `Room ${index + 1}`,
        confidence: 0.9, // Vision model doesn't return confidence, assume high
        bbox: { x, y, width, height },
        polygon: [
          { x, y },
          { x: x + width, y },
          { x: x + width, y: y + height },
          { x, y: y + height }
        ],
        maskUrl: null,
        featherPx: 12
      };
    });

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
