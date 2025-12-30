import { createSignal, Show } from 'solid-js';
import type { LocalProject } from '../types';

interface RenderCanvasProps {
  imageData: string;
  onRegenerate: () => void;
  onNewRender: () => void;
  project: LocalProject | null;
}

export default function RenderCanvas(props: RenderCanvasProps) {
  const [zoom, setZoom] = createSignal(1);
  const [pan, setPan] = createSignal({ x: 0, y: 0 });
  const [copied, setCopied] = createSignal(false);

  // Pan state
  let isDragging = false;
  let lastPos = { x: 0, y: 0 };

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.25, Math.min(4, zoom() * delta));
    setZoom(newZoom);
  };

  const handleMouseDown = (e: MouseEvent) => {
    isDragging = true;
    lastPos = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - lastPos.x;
    const dy = e.clientY - lastPos.y;
    setPan(p => ({ x: p.x + dx, y: p.y + dy }));
    lastPos = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    isDragging = false;
  };

  // Download image
  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = props.imageData;
    link.download = `homevision-render-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Copy share link
  const handleCopyLink = async () => {
    const project = props.project;
    if (!project) return;

    const shareUrl = `${window.location.origin}/project/${project.id}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div
      class="render-container"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div
        style={{
          transform: `translate(${pan().x}px, ${pan().y}px) scale(${zoom()})`,
          'transform-origin': 'center center',
          transition: 'transform 0.1s ease-out'
        }}
      >
        <img
          src={props.imageData}
          alt="3D-render av plantegning"
          class="render-image"
          draggable={false}
        />
      </div>

      <div class="render-actions">
        <button onClick={handleDownload}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Last ned
        </button>
        <button onClick={props.onRegenerate}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 4v6h6M23 20v-6h-6" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Generer på nytt
        </button>
        <Show when={props.project}>
          <button onClick={handleCopyLink}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            {copied() ? 'Kopiert!' : 'Kopier lenke'}
          </button>
        </Show>
      </div>

      <div class="preview-controls">
        <button onClick={() => setZoom(z => Math.min(4, z * 1.25))} title="Zoom inn">+</button>
        <button onClick={() => setZoom(z => Math.max(0.25, z / 1.25))} title="Zoom ut">−</button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} title="Tilbakestill">⟲</button>
      </div>
    </div>
  );
}
