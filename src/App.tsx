import { createSignal, Show, For } from 'solid-js';
import type { StylePreset, LocalProject, DetectedRoom } from './types';
import { generateId, generateSecretToken, getOrCreateClientId } from './utils/fileUtils';
import { getStyleConfig } from './utils/promptBuilder';
import FileUpload from './components/FileUpload';
import RoomOverlay from './components/RoomOverlay';
import RoomEditPanel from './components/RoomEditPanel';

// The two styles we auto-generate
const AUTO_STYLES: StylePreset[] = ['modern', 'traditional'];

interface GalleryImage {
  type: 'original' | 'render';
  style?: StylePreset;
  data: string;
  label: string;
}

export default function App() {
  // View state: upload -> planning (analyze 2D) -> generating -> render -> editing
  const [viewState, setViewState] = createSignal<'upload' | 'planning' | 'generating' | 'render' | 'editing'>('upload');

  // File state
  const [imageData, setImageData] = createSignal<string | null>(null);
  const [fileName, setFileName] = createSignal<string>('');

  // Render state
  const [renderProgress, setRenderProgress] = createSignal(0);
  const [renderError, setRenderError] = createSignal<string | null>(null);

  // Gallery state - original + renders
  const [galleryImages, setGalleryImages] = createSignal<GalleryImage[]>([]);
  const [currentIndex, setCurrentIndex] = createSignal(0);

  // Room editing state
  const [detectedRooms, setDetectedRooms] = createSignal<DetectedRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = createSignal<DetectedRoom | null>(null);
  const [isDetectingRooms, setIsDetectingRooms] = createSignal(false);
  const [isInpainting, setIsInpainting] = createSignal(false);
  const [roomDetectionError, setRoomDetectionError] = createSignal<string | null>(null);
  const [detectionMethod, setDetectionMethod] = createSignal<'v1' | 'v2'>('v1');

  // Touch/swipe state
  let touchStartX = 0;
  let touchEndX = 0;

  // Run room detection with specified method
  const runRoomDetection = async (imageDataUrl: string, method: 'v1' | 'v2') => {
    setIsDetectingRooms(true);
    setRoomDetectionError(null);
    setDetectedRooms([]);

    try {
      const { detectRoomsFrom2D } = await import('./api/rooms');
      const result = await detectRoomsFrom2D(imageDataUrl, method);
      if (result.rooms.length === 0) {
        setRoomDetectionError('No rooms detected in the floor plan');
      } else {
        setDetectedRooms(result.rooms);
      }
    } catch (err) {
      console.error('Room detection failed:', err);
      setRoomDetectionError(err instanceof Error ? err.message : 'Room detection failed');
    } finally {
      setIsDetectingRooms(false);
    }
  };

  // Handle file upload - analyze 2D floor plan first
  const handleFileSelect = async (dataUrl: string, name: string) => {
    setImageData(dataUrl);
    setFileName(name);
    setViewState('planning');
    await runRoomDetection(dataUrl, detectionMethod());
  };

  // Re-run detection with different method
  const handleRetryDetection = async (method: 'v1' | 'v2') => {
    setDetectionMethod(method);
    const image = imageData();
    if (image) {
      await runRoomDetection(image, method);
    }
  };

  // Start generating renders (called from planning view)
  const handleStartGeneration = () => {
    const image = imageData();
    if (image) {
      handleGenerateRenders(image);
    }
  };

  // Generate both styles in parallel
  const handleGenerateRenders = async (image: string) => {
    setViewState('generating');
    setRenderProgress(0);
    setRenderError(null);

    // Start with original image in gallery
    setGalleryImages([{
      type: 'original',
      data: image,
      label: 'Original'
    }]);

    // Simulate progress
    const progressInterval = setInterval(() => {
      setRenderProgress(prev => {
        if (prev < 30) return prev + 1.5;
        if (prev < 60) return prev + 0.8;
        if (prev < 85) return prev + 0.4;
        if (prev < 95) return prev + 0.15;
        return prev;
      });
    }, 500);

    try {
      const { generateIsometricRender } = await import('./api/openrouter');

      // Generate both styles in parallel
      const results = await Promise.all(
        AUTO_STYLES.map(async (style) => {
          try {
            const result = await generateIsometricRender(image, {
              style,
              annotations: []
            });
            return { style, result, error: null };
          } catch (err) {
            console.error(`Generation failed for ${style}:`, err);
            return { style, result: null, error: err };
          }
        })
      );

      clearInterval(progressInterval);
      setRenderProgress(100);

      // Add successful renders to gallery
      const newImages: GalleryImage[] = [{
        type: 'original',
        data: image,
        label: 'Original'
      }];

      for (const { style, result } of results) {
        if (result?.image) {
          const styleConfig = getStyleConfig(style);
          newImages.push({
            type: 'render',
            style,
            data: result.image,
            label: styleConfig.label
          });
        }
      }

      if (newImages.length > 1) {
        setGalleryImages(newImages);
        setCurrentIndex(1); // Start at first render
        setViewState('render');

        // Save to local storage
        const project: LocalProject = {
          id: generateId(),
          clientId: getOrCreateClientId(),
          secretToken: generateSecretToken(),
          originalFileUrl: '',
          originalFileName: fileName(),
          renderUrl: '',
          annotations: [],
          style: 'modern',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          originalFileData: image,
          renderData: newImages[1]?.data
        };

        const { saveProjectLocally } = await import('./api/storage');
        await saveProjectLocally(project);
      } else {
        throw new Error('No images were generated successfully');
      }
    } catch (err) {
      clearInterval(progressInterval);
      console.error('Generation failed:', err);
      setRenderError(err instanceof Error ? err.message : 'Generation failed');
      setViewState('upload');
    }
  };

  // Handle entering edit mode (rooms already detected during planning phase)
  const handleEnterEditMode = () => {
    const current = currentImage();
    if (!current || current.type === 'original') return;

    setViewState('editing');
    setSelectedRoom(null);
  };

  // Handle exiting edit mode
  const handleExitEditMode = () => {
    setViewState('render');
    setSelectedRoom(null);
  };

  // Handle room selection
  const handleRoomClick = (room: DetectedRoom) => {
    setSelectedRoom(room);
  };

  // Handle room inpainting
  const handleInpaint = async (prompt: string, strength: number) => {
    const room = selectedRoom();
    const current = currentImage();
    if (!room || !current) return;

    setIsInpainting(true);
    try {
      const { inpaintRoom } = await import('./api/rooms');
      const result = await inpaintRoom(current.data, room, prompt, strength);

      // Update the current image with the inpainted result
      const images = galleryImages();
      const idx = currentIndex();
      const newImages = [...images];
      newImages[idx] = {
        ...newImages[idx],
        data: result.fullImageUrl
      };
      setGalleryImages(newImages);

      // Close the edit panel
      setSelectedRoom(null);
    } catch (err) {
      console.error('Inpainting failed:', err);
      alert('Failed to update room. Please try again.');
    } finally {
      setIsInpainting(false);
    }
  };

  // Handle new render
  const handleNewRender = () => {
    setViewState('upload');
    setImageData(null);
    setFileName('');
    setGalleryImages([]);
    setCurrentIndex(0);
    setRenderError(null);
    setDetectedRooms([]);
    setSelectedRoom(null);
    setRoomDetectionError(null);
  };

  // Download current image
  const handleDownload = () => {
    const images = galleryImages();
    const current = images[currentIndex()];
    if (!current) return;

    const link = document.createElement('a');
    link.href = current.data;
    const suffix = current.type === 'original' ? 'original' : current.style;
    link.download = `beautiful-room-${suffix}-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Swipe handlers
  const handleTouchStart = (e: TouchEvent) => {
    touchStartX = e.touches[0].clientX;
  };

  const handleTouchMove = (e: TouchEvent) => {
    touchEndX = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    const diff = touchStartX - touchEndX;
    const threshold = 50;
    const images = galleryImages();

    if (Math.abs(diff) > threshold) {
      if (diff > 0 && currentIndex() < images.length - 1) {
        setCurrentIndex(i => i + 1);
      } else if (diff < 0 && currentIndex() > 0) {
        setCurrentIndex(i => i - 1);
      }
    }
  };

  // Navigate gallery
  const goToImage = (index: number) => {
    setCurrentIndex(index);
  };

  const nextImage = () => {
    const images = galleryImages();
    if (currentIndex() < images.length - 1) {
      setCurrentIndex(i => i + 1);
    }
  };

  const prevImage = () => {
    if (currentIndex() > 0) {
      setCurrentIndex(i => i - 1);
    }
  };

  // Get current image
  const currentImage = () => galleryImages()[currentIndex()];

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

        {/* Planning page - show 2D floor plan with detected rooms */}
        <Show when={viewState() === 'planning'}>
          <div class="planning-page">
            <div class="planning-container">
              <div class="planning-image-wrapper">
                <Show when={imageData()}>
                  <img
                    src={imageData()!}
                    alt="Floor plan"
                    class="planning-image"
                    draggable={false}
                  />
                  {/* Room overlay on 2D floor plan */}
                  <Show when={!isDetectingRooms() && detectedRooms().length > 0}>
                    <RoomOverlay
                      rooms={detectedRooms()}
                      selectedRoomId={selectedRoom()?.id || null}
                      onRoomClick={handleRoomClick}
                      imageWidth={1024}
                      imageHeight={1024}
                    />
                  </Show>
                  {/* Loading indicator */}
                  <Show when={isDetectingRooms()}>
                    <div class="detecting-rooms">
                      <div class="spinner" />
                      <span>Analyzing floor plan...</span>
                    </div>
                  </Show>
                  {/* Error state */}
                  <Show when={roomDetectionError()}>
                    <div class="detection-error">
                      <span>{roomDetectionError()}</span>
                    </div>
                  </Show>
                </Show>
              </div>

              {/* Detection method toggle */}
              <div class="detection-method-toggle">
                <span class="toggle-label">Detection:</span>
                <button
                  class={`toggle-btn ${detectionMethod() === 'v1' ? 'active' : ''}`}
                  onClick={() => handleRetryDetection('v1')}
                  disabled={isDetectingRooms()}
                >
                  V1 (Single)
                </button>
                <button
                  class={`toggle-btn ${detectionMethod() === 'v2' ? 'active' : ''}`}
                  onClick={() => handleRetryDetection('v2')}
                  disabled={isDetectingRooms()}
                >
                  V2 (Two-pass)
                </button>
              </div>

              {/* Room list */}
              <Show when={!isDetectingRooms() && detectedRooms().length > 0}>
                <div class="detected-rooms-list">
                  <h4>Detected Rooms ({detectedRooms().length})</h4>
                  <div class="rooms-chips">
                    <For each={detectedRooms()}>
                      {(room) => (
                        <span class="room-chip">{room.label}</span>
                      )}
                    </For>
                  </div>
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
              <h3>Creating your 3D rooms</h3>
              <p class="loading-hint">
                {renderProgress() < 20 && 'Analyzing floor plan...'}
                {renderProgress() >= 20 && renderProgress() < 40 && 'Generating modern style...'}
                {renderProgress() >= 40 && renderProgress() < 60 && 'Generating traditional style...'}
                {renderProgress() >= 60 && renderProgress() < 80 && 'Adding details...'}
                {renderProgress() >= 80 && 'Final touches...'}
              </p>
            </div>
          </div>
        </Show>

        {/* Render gallery page */}
        <Show when={viewState() === 'render'}>
          <div
            class="gallery-container"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div class="gallery-image-wrapper">
              <Show when={currentImage()}>
                <img
                  src={currentImage()!.data}
                  alt={currentImage()!.label}
                  class="gallery-image"
                  draggable={false}
                />
              </Show>
            </div>

            {/* Navigation arrows (desktop) */}
            <Show when={currentIndex() > 0}>
              <button class="gallery-nav gallery-nav-prev" onClick={prevImage}>
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="15,18 9,12 15,6" />
                </svg>
              </button>
            </Show>
            <Show when={currentIndex() < galleryImages().length - 1}>
              <button class="gallery-nav gallery-nav-next" onClick={nextImage}>
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="9,18 15,12 9,6" />
                </svg>
              </button>
            </Show>

            {/* Image label */}
            <div class="gallery-label">
              {currentImage()?.label}
            </div>

            {/* Dots indicator */}
            <div class="gallery-dots">
              <For each={galleryImages()}>
                {(_, index) => (
                  <button
                    class={`gallery-dot ${currentIndex() === index() ? 'active' : ''}`}
                    onClick={() => goToImage(index())}
                  />
                )}
              </For>
            </div>
          </div>
        </Show>

        {/* Editing mode */}
        <Show when={viewState() === 'editing'}>
          <div class="editing-container">
            <div class="editing-image-wrapper">
              <Show when={currentImage()}>
                <img
                  src={currentImage()!.data}
                  alt={currentImage()!.label}
                  class="editing-image"
                  draggable={false}
                />
                {/* Room overlay */}
                <Show when={!isDetectingRooms()}>
                  <RoomOverlay
                    rooms={detectedRooms()}
                    selectedRoomId={selectedRoom()?.id || null}
                    onRoomClick={handleRoomClick}
                    imageWidth={1024}
                    imageHeight={1024}
                  />
                </Show>
                {/* Loading indicator for room detection */}
                <Show when={isDetectingRooms()}>
                  <div class="detecting-rooms">
                    <div class="spinner" />
                    <span>Analyzing floor plan...</span>
                  </div>
                </Show>
                {/* Error state */}
                <Show when={roomDetectionError()}>
                  <div class="detection-error">
                    <span>{roomDetectionError()}</span>
                  </div>
                </Show>
              </Show>
            </div>

            {/* Edit panel */}
            <Show when={selectedRoom()}>
              <RoomEditPanel
                room={selectedRoom()!}
                onInpaint={handleInpaint}
                onClose={() => setSelectedRoom(null)}
                isProcessing={isInpainting()}
              />
            </Show>

            {/* Instruction hint */}
            <Show when={!selectedRoom() && !isDetectingRooms()}>
              <div class="editing-hint">
                Tap a room to edit it
              </div>
            </Show>
          </div>
        </Show>
      </main>

      {/* Bottom bar - planning page */}
      <Show when={viewState() === 'planning'}>
        <div class="bottom-bar">
          <button class="bottom-bar-btn" onClick={handleNewRender}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15,18 9,12 15,6" />
            </svg>
            <span>Back</span>
          </button>

          <button
            class="bottom-bar-btn primary"
            onClick={handleStartGeneration}
            disabled={isDetectingRooms() || detectedRooms().length === 0}
          >
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5,3 19,12 5,21" fill="currentColor" />
            </svg>
            <span>Generate 3D</span>
          </button>
        </div>
      </Show>

      {/* Bottom bar - render page */}
      <Show when={viewState() === 'render'}>
        <div class="bottom-bar">
          <button class="bottom-bar-btn" onClick={handleDownload}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Download</span>
          </button>

          <Show when={currentImage()?.type === 'render'}>
            <button class="bottom-bar-btn" onClick={handleEnterEditMode}>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span>Edit</span>
            </button>
          </Show>

          <button class="bottom-bar-btn primary" onClick={handleNewRender}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>New</span>
          </button>
        </div>
      </Show>

      {/* Bottom bar - editing mode */}
      <Show when={viewState() === 'editing'}>
        <div class="bottom-bar">
          <button class="bottom-bar-btn" onClick={handleExitEditMode}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15,18 9,12 15,6" />
            </svg>
            <span>Back</span>
          </button>

          <button class="bottom-bar-btn" onClick={handleDownload}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>Download</span>
          </button>
        </div>
      </Show>
    </div>
  );
}
