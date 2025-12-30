// Vercel Serverless Function for project CRUD operations

// In-memory store for development
const devStore = new Map();

export default async function handler(req, res) {
  // Try to use Vercel KV, fall back to in-memory store
  let kv = null;

  try {
    const kvModule = await import('@vercel/kv');
    kv = kvModule.kv;
  } catch {
    // KV not available, use dev store
  }

  const getProject = async (id) => {
    if (kv) {
      return await kv.get(`project:${id}`);
    }
    return devStore.get(id) || null;
  };

  const setProject = async (id, data) => {
    if (kv) {
      await kv.set(`project:${id}`, data);
    } else {
      devStore.set(id, data);
    }
  };

  const deleteProject = async (id) => {
    if (kv) {
      await kv.del(`project:${id}`);
    } else {
      devStore.delete(id);
    }
  };

  try {
    // GET - Fetch project by ID
    if (req.method === 'GET') {
      const projectId = req.query.id;

      if (!projectId) {
        return res.status(400).json({ error: 'Missing project ID' });
      }

      const project = await getProject(projectId);

      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const { secretToken, ...publicProject } = project;
      return res.status(200).json(publicProject);
    }

    // POST - Create new project
    if (req.method === 'POST') {
      const {
        id,
        clientId,
        secretToken,
        originalFileName,
        originalFileUrl,
        renderUrl,
        annotations,
        style,
        createdAt
      } = req.body;

      if (!id || !clientId || !secretToken) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const projectData = {
        id,
        clientId,
        secretToken,
        originalFileName,
        originalFileUrl,
        renderUrl,
        annotations: annotations || [],
        style: style || 'modern',
        createdAt: createdAt || Date.now()
      };

      await setProject(id, projectData);

      return res.status(201).json({
        id,
        shareUrl: `/project/${id}`
      });
    }

    // DELETE - Delete project
    if (req.method === 'DELETE') {
      const { id, secretToken } = req.body;

      if (!id || !secretToken) {
        return res.status(400).json({ error: 'Missing id or secretToken' });
      }

      const project = await getProject(id);

      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      if (project.secretToken !== secretToken) {
        return res.status(403).json({ error: 'Invalid secret token' });
      }

      await deleteProject(id);

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Project API error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
