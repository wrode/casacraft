// Vercel Serverless Function for room inpainting using Replicate SDXL-inpaint

const REPLICATE_API_URL = 'https://api.replicate.com/v1/predictions';

// SDXL Inpaint model on Replicate
const SDXL_INPAINT_VERSION = 'stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.REPLICATE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Replicate API key not configured' });
  }

  try {
    const { imageUrl, roomId, bbox, maskUrl, prompt, strength = 0.8, seed } = req.body;

    if (!imageUrl || !roomId || !prompt) {
      return res.status(400).json({ error: 'Missing required fields: imageUrl, roomId, prompt' });
    }

    // Build the inpaint prompt
    const fullPrompt = `${prompt}. High quality interior design, photorealistic, detailed textures, professional lighting.`;
    const negativePrompt = 'low quality, blurry, distorted, text, watermark, labels, annotations';

    // Call Replicate's SDXL inpaint model
    const response = await fetch(REPLICATE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: SDXL_INPAINT_VERSION,
        input: {
          image: imageUrl,
          mask: maskUrl || imageUrl, // Use image as mask placeholder if no mask
          prompt: fullPrompt,
          negative_prompt: negativePrompt,
          strength: strength,
          num_inference_steps: 30,
          guidance_scale: 7.5,
          scheduler: 'K_EULER',
          seed: seed || Math.floor(Math.random() * 1000000),
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Replicate API error: ${error}`);
    }

    const prediction = await response.json();

    // Poll for completion
    let result = prediction;
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds max

    while (result.status !== 'succeeded' && result.status !== 'failed' && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      const statusResponse = await fetch(result.urls.get, {
        headers: {
          'Authorization': `Token ${apiKey}`,
        }
      });

      result = await statusResponse.json();
      attempts++;
    }

    if (result.status === 'failed') {
      throw new Error(result.error || 'Inpainting failed');
    }

    if (result.status !== 'succeeded') {
      throw new Error('Inpainting timed out');
    }

    // Get the output image
    const outputUrl = Array.isArray(result.output) ? result.output[0] : result.output;

    return res.status(200).json({
      cropUrl: outputUrl,
      fullImageUrl: outputUrl, // In production, composite back to full image
      roomId: roomId
    });

  } catch (error) {
    console.error('Inpaint error:', error);
    return res.status(500).json({ error: error.message || 'Inpainting failed' });
  }
}
