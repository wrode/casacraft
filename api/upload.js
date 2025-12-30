// Vercel Serverless Function for file upload to Blob storage

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    // In development or when blob storage isn't configured, return mock URLs
    return res.status(200).json({
      originalUrl: null,
      renderUrl: null,
      message: 'Blob storage not configured - using local storage only'
    });
  }

  try {
    const { originalFile, renderFile, projectId } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: 'Missing projectId' });
    }

    let originalUrl = null;
    let renderUrl = null;

    // Dynamic import of @vercel/blob
    try {
      const { put } = await import('@vercel/blob');

      if (originalFile) {
        const originalBuffer = Buffer.from(
          originalFile.replace(/^data:image\/\w+;base64,/, ''),
          'base64'
        );
        const originalBlob = await put(`homevision/${projectId}/original.png`, originalBuffer, {
          access: 'public',
          contentType: 'image/png'
        });
        originalUrl = originalBlob.url;
      }

      if (renderFile) {
        const renderBuffer = Buffer.from(
          renderFile.replace(/^data:image\/\w+;base64,/, ''),
          'base64'
        );
        const renderBlob = await put(`homevision/${projectId}/render.png`, renderBuffer, {
          access: 'public',
          contentType: 'image/png'
        });
        renderUrl = renderBlob.url;
      }
    } catch (blobError) {
      console.error('Blob storage error:', blobError);
    }

    return res.status(200).json({ originalUrl, renderUrl });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
