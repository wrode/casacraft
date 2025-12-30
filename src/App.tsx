import { createSignal, Show, createEffect } from 'solid-js';
import type { ViewState, StylePreset, Annotation, RenderState, LocalProject } from './types';
import { generateId, generateSecretToken, getOrCreateClientId } from './utils/fileUtils';
import { STYLE_CONFIGS, getStyleConfig } from './utils/promptBuilder';
import FileUpload from './components/FileUpload';
import FloorplanPreview from './components/FloorplanPreview';
import AnnotationLayer from './components/AnnotationLayer';
import RenderCanvas from './components/RenderCanvas';
import StyleSelector from './components/StyleSelector';
import ProjectHistory from './components/ProjectHistory';

export default function App() {
  // View state
  const [viewState, setViewState] = createSignal<ViewState>('upload');

  // File state
  const [imageData, setImageData] = createSignal<string | null>(null);
  const [fileName, setFileName] = createSignal<string>('');

  // Annotation state
  const [annotations, setAnnotations] = createSignal<Annotation[]>([]);

  // Style state
  const [selectedStyle, setSelectedStyle] = createSignal<StylePreset>('modern');

  // Render state
  const [renderState, setRenderState] = createSignal<RenderState>('idle');
  const [renderProgress, setRenderProgress] = createSignal(0);
  const [renderResult, setRenderResult] = createSignal<string | null>(null);
  const [renderError, setRenderError] = createSignal<string | null>(null);

  // Project state
  const [currentProject, setCurrentProject] = createSignal<LocalProject | null>(null);

  // Handle file upload
  const handleFileSelect = (dataUrl: string, name: string) => {
    setImageData(dataUrl);
    setFileName(name);
    setViewState('preview');
  };

  // Handle continue to annotate
  const handleContinueToAnnotate = () => {
    setViewState('annotate');
  };

  // Handle generate render
  const handleGenerateRender = async () => {
    const image = imageData();
    if (!image) return;

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
      const result = await generateIsometricRender(image, {
        style: selectedStyle(),
        annotations: annotations()
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
          originalFileName: fileName(),
          renderUrl: '',
          annotations: annotations(),
          style: selectedStyle(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          originalFileData: image,
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
    }
  };

  // Handle back navigation
  const handleBack = () => {
    const current = viewState();
    if (current === 'preview') {
      setViewState('upload');
      setImageData(null);
      setFileName('');
    } else if (current === 'annotate') {
      setViewState('preview');
    } else if (current === 'render') {
      setViewState('annotate');
    }
  };

  // Handle new render
  const handleNewRender = () => {
    setViewState('upload');
    setImageData(null);
    setFileName('');
    setAnnotations([]);
    setRenderResult(null);
    setRenderState('idle');
    setCurrentProject(null);
  };

  // Handle project load from history
  const handleLoadProject = (project: LocalProject) => {
    if (project.originalFileData) {
      setImageData(project.originalFileData);
    }
    setFileName(project.originalFileName);
    setAnnotations(project.annotations);
    setSelectedStyle(project.style);

    if (project.renderData) {
      setRenderResult(project.renderData);
      setRenderState('done');
      setViewState('render');
    } else {
      setViewState('preview');
    }
    setCurrentProject(project);
  };

  // Handle regenerate
  const handleRegenerate = () => {
    setViewState('annotate');
    setRenderResult(null);
    setRenderState('idle');
  };

  // Get current style config
  const currentStyleConfig = () => getStyleConfig(selectedStyle());

  return (
    <div class="app">
      {/* Header - shown in all states except upload */}
      <Show when={viewState() !== 'upload'}>
        <header class="header">
          <button class="back-button" onClick={handleBack}>
            ← Tilbake
          </button>
          <h1>CasaCraft</h1>
        </header>
      </Show>

      <main class="main">
        {/* Upload page */}
        <Show when={viewState() === 'upload'}>
          <div class="upload-page">
            <div class="upload-hero">
              <div class="logo-mark">CasaCraft</div>
              <p class="tagline">Last opp en plantegning for å komme i gang</p>
              <FileUpload onFileSelect={handleFileSelect} />
            </div>
          </div>
        </Show>

        {/* Preview page */}
        <Show when={viewState() === 'preview'}>
          <div class="content-area">
            <FloorplanPreview
              imageData={imageData()!}
              onImageChange={setImageData}
            />
          </div>
          <aside class="sidebar">
            <div class="sidebar-section">
              <h3>Plantegning</h3>
              <p>{fileName()}</p>
            </div>

            <div class="sidebar-section">
              <h3>Neste steg</h3>
              <p>Du kan legge til merknader på plantegningen, eller gå direkte til generering.</p>
              <button class="generate-btn" onClick={handleContinueToAnnotate}>
                Fortsett til merknader
              </button>
            </div>
          </aside>
        </Show>

        {/* Annotate page */}
        <Show when={viewState() === 'annotate'}>
          <div class="content-area">
            <div class="preview-container">
              <Show when={imageData()}>
                <img src={imageData()!} alt="Plantegning" class="preview-image" />
                <AnnotationLayer
                  annotations={annotations()}
                  onAnnotationsChange={setAnnotations}
                />
              </Show>
            </div>

            {/* Loading overlay */}
            <Show when={renderState() === 'generating'}>
              <div class="loading-overlay">
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
                  <h3>Genererer 3D-visning</h3>
                  <p class="loading-hint">
                    {renderProgress() < 20 && 'Analyserer plantegning...'}
                    {renderProgress() >= 20 && renderProgress() < 40 && 'Identifiserer rom...'}
                    {renderProgress() >= 40 && renderProgress() < 60 && 'Plasserer møbler...'}
                    {renderProgress() >= 60 && renderProgress() < 80 && 'Legger til detaljer...'}
                    {renderProgress() >= 80 && 'Siste finpuss...'}
                  </p>
                </div>
              </div>
            </Show>
          </div>

          <aside class="sidebar">
            <div class="sidebar-section">
              <h3>Rommerknader</h3>
              <p>Legg til etiketter for rommene for bedre resultat.</p>
              <Show when={annotations().length > 0}>
                <p style={{ 'margin-top': '0.5rem', 'font-weight': '500' }}>
                  {annotations().length} merknad{annotations().length !== 1 ? 'er' : ''}
                </p>
              </Show>
            </div>

            <StyleSelector
              value={selectedStyle()}
              onChange={setSelectedStyle}
            />

            <button
              class="generate-btn"
              onClick={handleGenerateRender}
              disabled={renderState() === 'generating'}
            >
              {renderState() === 'generating' ? 'Genererer...' : 'Generer 3D-visning'}
            </button>

            <Show when={renderError()}>
              <div class="error-message">
                {renderError()}
              </div>
            </Show>

            <ProjectHistory onLoadProject={handleLoadProject} />
          </aside>
        </Show>

        {/* Render result page */}
        <Show when={viewState() === 'render'}>
          <div class="content-area">
            <RenderCanvas
              imageData={renderResult()!}
              onRegenerate={handleRegenerate}
              onNewRender={handleNewRender}
              project={currentProject()}
            />
          </div>

          <aside class="sidebar">
            <div class="sidebar-section">
              <h3>Resultat</h3>
              <p>Din 3D-visning er klar! Du kan laste ned eller dele resultatet.</p>
            </div>

            <div class="sidebar-section">
              <h3>Stil</h3>
              <p>{currentStyleConfig().label}</p>
              <p class="style-description">{currentStyleConfig().description}</p>
            </div>

            <button class="btn-secondary" style={{ width: '100%', 'margin-top': '1rem' }} onClick={handleRegenerate}>
              Juster og generer på nytt
            </button>

            <button class="generate-btn" onClick={handleNewRender}>
              Ny plantegning
            </button>

            <ProjectHistory onLoadProject={handleLoadProject} />
          </aside>
        </Show>
      </main>
    </div>
  );
}
