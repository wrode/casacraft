import { openDB, type IDBPDatabase } from 'idb';
import type { LocalProject } from '../types';

const DB_NAME = 'homevision';
const DB_VERSION = 1;
const PROJECTS_STORE = 'projects';

let dbPromise: Promise<IDBPDatabase> | null = null;

/**
 * Gets the IndexedDB database instance
 */
async function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Create projects store if it doesn't exist
        if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
          const store = db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
          store.createIndex('clientId', 'clientId');
          store.createIndex('createdAt', 'createdAt');
        }
      }
    });
  }
  return dbPromise;
}

/**
 * Saves a project to local IndexedDB storage
 */
export async function saveProjectLocally(project: LocalProject): Promise<void> {
  const db = await getDB();
  await db.put(PROJECTS_STORE, {
    ...project,
    updatedAt: Date.now()
  });
}

/**
 * Gets all local projects for the current client
 */
export async function getLocalProjects(clientId: string): Promise<LocalProject[]> {
  const db = await getDB();
  const projects = await db.getAllFromIndex(PROJECTS_STORE, 'clientId', clientId);

  // Sort by creation date, newest first
  return projects.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Gets a single project by ID
 */
export async function getLocalProject(id: string): Promise<LocalProject | undefined> {
  const db = await getDB();
  return db.get(PROJECTS_STORE, id);
}

/**
 * Deletes a project from local storage
 */
export async function deleteLocalProject(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(PROJECTS_STORE, id);
}

/**
 * Gets the count of local projects
 */
export async function getLocalProjectCount(clientId: string): Promise<number> {
  const db = await getDB();
  const projects = await db.getAllFromIndex(PROJECTS_STORE, 'clientId', clientId);
  return projects.length;
}

/**
 * Clears all local projects (use with caution)
 */
export async function clearLocalProjects(): Promise<void> {
  const db = await getDB();
  await db.clear(PROJECTS_STORE);
}

// Remote storage functions (for Vercel Blob + KV)

/**
 * Saves a project to remote storage
 */
export async function saveProjectRemote(project: LocalProject): Promise<{ projectId: string; shareUrl: string }> {
  // Upload original file to Blob storage
  const uploadResponse = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      originalFile: project.originalFileData,
      renderFile: project.renderData,
      projectId: project.id
    })
  });

  if (!uploadResponse.ok) {
    throw new Error('Failed to upload files');
  }

  const uploadResult = await uploadResponse.json();

  // Save metadata to KV
  const metadataResponse = await fetch('/api/project', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: project.id,
      clientId: project.clientId,
      secretToken: project.secretToken,
      originalFileName: project.originalFileName,
      originalFileUrl: uploadResult.originalUrl,
      renderUrl: uploadResult.renderUrl,
      annotations: project.annotations,
      style: project.style,
      createdAt: project.createdAt
    })
  });

  if (!metadataResponse.ok) {
    throw new Error('Failed to save project metadata');
  }

  return {
    projectId: project.id,
    shareUrl: `${window.location.origin}/project/${project.id}`
  };
}

/**
 * Fetches a project by share ID (for shared links)
 */
export async function fetchProjectByShareId(projectId: string): Promise<LocalProject | null> {
  const response = await fetch(`/api/project?id=${projectId}`);

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error('Failed to fetch project');
  }

  return response.json();
}

/**
 * Deletes a project from remote storage
 */
export async function deleteProjectRemote(projectId: string, secretToken: string): Promise<void> {
  const response = await fetch('/api/project', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: projectId, secretToken })
  });

  if (!response.ok) {
    throw new Error('Failed to delete project');
  }
}
