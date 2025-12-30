import { createSignal } from 'solid-js';
import { rotateImage } from '../utils/fileUtils';

interface FloorplanPreviewProps {
  imageData: string;
  onImageChange: (dataUrl: string) => void;
}

export default function FloorplanPreview(props: FloorplanPreviewProps) {
  const [zoom, setZoom] = createSignal(1);
  const [pan, setPan] = createSignal({ x: 0, y: 0 });
  const [rotating, setRotating] = createSignal(false);

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

  const handleRotate = async (degrees: 90 | 270) => {
    if (rotating()) return;
    setRotating(true);

    try {
      const rotated = await rotateImage(props.imageData, degrees);
      props.onImageChange(rotated);
    } catch (err) {
      console.error('Rotation failed:', err);
    } finally {
      setRotating(false);
    }
  };

  const handleZoomIn = () => {
    setZoom(z => Math.min(4, z * 1.25));
  };

  const handleZoomOut = () => {
    setZoom(z => Math.max(0.25, z / 1.25));
  };

  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div
      class="preview-container"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div
        class="preview-image-wrapper"
        style={{
          transform: `translate(${pan().x}px, ${pan().y}px) scale(${zoom()})`
        }}
      >
        <img
          src={props.imageData}
          alt="Plantegning"
          class="preview-image"
          draggable={false}
        />
      </div>

      <div class="preview-controls">
        <button onClick={handleZoomIn} title="Zoom inn">+</button>
        <button onClick={handleZoomOut} title="Zoom ut">−</button>
        <button onClick={handleReset} title="Tilbakestill">⟲</button>
        <button
          onClick={() => handleRotate(270)}
          title="Roter mot klokka"
          disabled={rotating()}
        >
          ↺
        </button>
        <button
          onClick={() => handleRotate(90)}
          title="Roter med klokka"
          disabled={rotating()}
        >
          ↻
        </button>
      </div>

      <div class="preview-info">
        Zoom: {Math.round(zoom() * 100)}%
      </div>
    </div>
  );
}
