import { createSignal } from 'solid-js';

interface RenderCanvasProps {
  imageData: string;
  onRegenerate: () => void;
  onNewRender: () => void;
  project: unknown;
}

export default function RenderCanvas(props: RenderCanvasProps) {
  const [zoom, setZoom] = createSignal(1);
  const [pan, setPan] = createSignal({ x: 0, y: 0 });

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
    link.download = `beautiful-room-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
        <button onClick={handleDownload} title="Download">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>

      <div class="preview-controls">
        <button onClick={() => setZoom(z => Math.min(4, z * 1.25))} title="Zoom inn">+</button>
        <button onClick={() => setZoom(z => Math.max(0.25, z / 1.25))} title="Zoom ut">−</button>
        <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} title="Tilbakestill">⟲</button>
      </div>
    </div>
  );
}
