import { createSignal, createEffect, For, Show } from 'solid-js';
import type { LocalProject } from '../types';
import { getLocalProjects, deleteLocalProject } from '../api/storage';
import { getOrCreateClientId } from '../utils/fileUtils';

interface ProjectHistoryProps {
  onLoadProject: (project: LocalProject) => void;
}

export default function ProjectHistory(props: ProjectHistoryProps) {
  const [projects, setProjects] = createSignal<LocalProject[]>([]);
  const [loading, setLoading] = createSignal(true);

  // Load projects on mount
  createEffect(async () => {
    try {
      const clientId = getOrCreateClientId();
      const localProjects = await getLocalProjects(clientId);
      setProjects(localProjects);
    } catch (err) {
      console.error('Failed to load project history:', err);
    } finally {
      setLoading(false);
    }
  });

  // Format date
  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    // Less than a minute
    if (diff < 60000) {
      return 'Akkurat nå';
    }

    // Less than an hour
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `${minutes} min siden`;
    }

    // Less than a day
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours} time${hours !== 1 ? 'r' : ''} siden`;
    }

    // Less than a week
    if (diff < 604800000) {
      const days = Math.floor(diff / 86400000);
      return `${days} dag${days !== 1 ? 'er' : ''} siden`;
    }

    // Default: formatted date
    return date.toLocaleDateString('no-NO', {
      day: 'numeric',
      month: 'short'
    });
  };

  // Handle delete
  const handleDelete = async (e: MouseEvent, projectId: string) => {
    e.stopPropagation();

    if (!confirm('Er du sikker på at du vil slette dette prosjektet?')) {
      return;
    }

    try {
      await deleteLocalProject(projectId);
      setProjects(prev => prev.filter(p => p.id !== projectId));
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
  };

  // Style name mapping
  const styleNames: Record<string, string> = {
    modern: 'Moderne',
    scandinavian: 'Skandinavisk',
    industrial: 'Industriell',
    traditional: 'Tradisjonell',
    colorful: 'Fargerik'
  };

  return (
    <Show when={!loading() && projects().length > 0}>
      <div class="sidebar-section">
        <h3>Tidligere prosjekter</h3>
        <div class="history-panel">
          <For each={projects().slice(0, 5)}>
            {(project) => (
              <div
                class="history-item"
                onClick={() => props.onLoadProject(project)}
              >
                <Show
                  when={project.renderData}
                  fallback={
                    <div
                      style={{
                        width: '50px',
                        height: '50px',
                        background: '#f3f4f6',
                        'border-radius': '6px',
                        display: 'flex',
                        'align-items': 'center',
                        'justify-content': 'center',
                        color: '#9ca3af',
                        'font-size': '1.5rem'
                      }}
                    >
                      📐
                    </div>
                  }
                >
                  <img
                    src={project.renderData}
                    alt={project.originalFileName}
                  />
                </Show>
                <div class="history-item-info">
                  <h4>{project.originalFileName}</h4>
                  <p>
                    {styleNames[project.style] || project.style} • {formatDate(project.createdAt)}
                  </p>
                </div>
                <button
                  class="history-delete"
                  onClick={(e) => handleDelete(e, project.id)}
                  title="Slett"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
              </div>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}
