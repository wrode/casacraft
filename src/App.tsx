import { createSignal, Show, For } from 'solid-js';
import type { ViewState, StylePreset, RenderState, LocalProject } from './types';
import { generateId, generateSecretToken, getOrCreateClientId } from './utils/fileUtils';
import { STYLE_CONFIGS, getStyleConfig } from './utils/promptBuilder';
import FileUpload from './components/FileUpload';
import RenderCanvas from './components/RenderCanvas';
import ProjectHistory from './components/ProjectHistory';

export default function App() {
  // View state - simplified: upload | generating | render
  const [viewState, setViewState] = createSignal<ViewState>('upload');

  // File state
  const [imageData, setImageData] = createSignal<string | null>(null);
  const [fileName, setFileName] = createSignal<string>('');

  // Style state
  const [selectedStyle, setSelectedStyle] = createSignal<StylePreset>('modern');
  const [showStylePicker, setShowStylePicker] = createSignal(false);

  // Render state
  const [renderState, setRenderState] = createSignal<RenderState>('idle');
  const [renderProgress, setRenderProgress] = createSignal(0);
  const [renderResult, setRenderResult] = createSignal<string | null>(null);
  const [renderError, setRenderError] = createSignal<string | null>(null);

  // Project state
  const [currentProject, setCurrentProject] = createSignal<LocalProject | null>(null);

  // History panel
  const [showHistory, setShowHistory] = createSignal(false);

  // Handle file upload - go directly to generation
  const handleFileSelect = (dataUrl: string, name: string) => {
    setImageData(dataUrl);
    setFileName(name);
    // Auto-start generation
    handleGenerateRender(dataUrl, name);
  };

  // Handle generate render
  const handleGenerateRender = async (image?: string, name?: string) => {
    const img = image || imageData();
    const fName = name || fileName();
    if (!img) return;

    setViewState('generating');
    setRenderState('generating');
    setRenderProgress(0);
    setRenderError(null);

    // Simulate progress
    const progressInterval = setInterval(() => {
      setRenderProgress(prev => {
        if (prev < 30) return prev + 2;
        if (prev < 60) return prev + 1;
        if (prev < 85) return prev + 0.5;
        if (prev < 95) return prev + 0.2;
        return prev;
      });
    }, 500);

    try {
      // Import and call AI generation
      const { generateIsometricRender } = await import('./api/openrouter');
      const result = await generateIsometricRender(img, {
        style: selectedStyle(),
        annotations: [] // No annotations in simplified flow
      });

      clearInterval(progressInterval);
      setRenderProgress(100);

      if (result.image) {
        setRenderResult(result.image);
        setRenderState('done');
        setViewState('render');

        // Create project record
        const project: LocalProject = {
          id: generateId(),
          clientId: getOrCreateClientId(),
          secretToken: generateSecretToken(),
          originalFileUrl: '',
          originalFileName: fName,
          renderUrl: '',
          annotations: [],
          style: selectedStyle(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          originalFileData: img,
          renderData: result.image
        };
        setCurrentProject(project);

        // Save to local storage
        const { saveProjectLocally } = await import('./api/storage');
        await saveProjectLocally(project);
      } else {
        throw new Error('No image returned from AI');
      }
    } catch (err) {
      clearInterval(progressInterval);
      console.error('Generation failed:', err);
      setRenderError(err instanceof Error ? err.message : 'Generation failed');
      setRenderState('error');
      setViewState('upload');
    }
  };

  // Handle new render
  const handleNewRender = () => {
    setViewState('upload');
    setImageData(null);
    setFileName('');
    setRenderResult(null);
    setRenderState('idle');
    setCurrentProject(null);
    setShowStylePicker(false);
    setShowHistory(false);
  };

  // Handle regenerate with different style
  const handleRegenerate = () => {
    const img = imageData();
    if (img) {
      handleGenerateRender(img, fileName());
    }
  };

  // Handle project load from history
  const handleLoadProject = (project: LocalProject) => {
    if (project.originalFileData) {
      setImageData(project.originalFileData);
    }
    setFileName(project.originalFileName);
    setSelectedStyle(project.style);

    if (project.renderData) {
      setRenderResult(project.renderData);
      setRenderState('done');
      setViewState('render');
    } else {
      setViewState('upload');
    }
    setCurrentProject(project);
    setShowHistory(false);
  };

  // Get current style config
  const currentStyleConfig = () => getStyleConfig(selectedStyle());

  return (
    <div class="app">
      <main class="main-content">
        {/* Upload page */}
        <Show when={viewState() === 'upload'}>
          <div class="upload-page">
            <div class="upload-hero">
              <div class="logo-mark">Beautiful Room</div>
              <p class="tagline">Transform floor plans into stunning 3D renders</p>
              <FileUpload onFileSelect={handleFileSelect} />

              <Show when={renderError()}>
                <div class="error-message">
                  {renderError()}
                </div>
              </Show>
            </div>
          </div>
        </Show>

        {/* Generating page */}
        <Show when={viewState() === 'generating'}>
          <div class="generating-page">
            <div class="loading-card">
              <div class="loading-icon">
                <svg viewBox="0 0 100 100" class="progress-ring">
                  <circle class="progress-ring-bg" cx="50" cy="50" r="42" />
                  <circle
                    class="progress-ring-fill"
                    cx="50"
                    cy="50"
                    r="42"
                    style={{
                      'stroke-dasharray': `${2 * Math.PI * 42}`,
                      'stroke-dashoffset': `${2 * Math.PI * 42 * (1 - renderProgress() / 100)}`
                    }}
                  />
                </svg>
                <span class="progress-text">{Math.round(renderProgress())}%</span>
              </div>
              <h3>Creating your 3D room</h3>
              <p class="loading-hint">
                {renderProgress() < 20 && 'Analyzing floor plan...'}
                {renderProgress() >= 20 && renderProgress() < 40 && 'Identifying rooms...'}
                {renderProgress() >= 40 && renderProgress() < 60 && 'Placing furniture...'}
                {renderProgress() >= 60 && renderProgress() < 80 && 'Adding details...'}
                {renderProgress() >= 80 && 'Final touches...'}
              </p>
            </div>
          </div>
        </Show>

        {/* Render result page */}
        <Show when={viewState() === 'render'}>
          <RenderCanvas
            imageData={renderResult()!}
            onRegenerate={handleRegenerate}
            onNewRender={handleNewRender}
            project={currentProject()}
          />
        </Show>
      </main>

      {/* Bottom bar - shown on upload and render pages */}
      <Show when={viewState() === 'upload' || viewState() === 'render'}>
        <div class="bottom-bar">
          {/* Style picker button */}
          <button
            class="bottom-bar-btn"
            onClick={() => { setShowStylePicker(!showStylePicker()); setShowHistory(false); }}
          >
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            <span>{currentStyleConfig().label}</span>
          </button>

          {/* History button */}
          <button
            class="bottom-bar-btn"
            onClick={() => { setShowHistory(!showHistory()); setShowStylePicker(false); }}
          >
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12,6 12,12 16,14" />
            </svg>
            <span>History</span>
          </button>

          {/* New render button - only on render page */}
          <Show when={viewState() === 'render'}>
            <button
              class="bottom-bar-btn primary"
              onClick={handleNewRender}
            >
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>New</span>
            </button>
          </Show>
        </div>

        {/* Style picker panel */}
        <Show when={showStylePicker()}>
          <div class="bottom-panel">
            <div class="panel-header">
              <h3>Choose Style</h3>
              <button class="close-btn" onClick={() => setShowStylePicker(false)}>×</button>
            </div>
            <div class="style-grid">
              <For each={STYLE_CONFIGS}>
                {(style) => (
                  <button
                    class={`style-option ${selectedStyle() === style.value ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedStyle(style.value as StylePreset);
                      setShowStylePicker(false);
                      // If on render page, regenerate with new style
                      if (viewState() === 'render' && imageData()) {
                        handleRegenerate();
                      }
                    }}
                  >
                    <span class="style-name">{style.label}</span>
                    <span class="style-desc">{style.description}</span>
                  </button>
                )}
              </For>
            </div>
          </div>
        </Show>

        {/* History panel */}
        <Show when={showHistory()}>
          <div class="bottom-panel">
            <div class="panel-header">
              <h3>Recent Projects</h3>
              <button class="close-btn" onClick={() => setShowHistory(false)}>×</button>
            </div>
            <ProjectHistory onLoadProject={handleLoadProject} />
          </div>
        </Show>
      </Show>
    </div>
  );
}
