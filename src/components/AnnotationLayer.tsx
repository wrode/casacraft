import { createSignal, createEffect, For, Index, Show } from 'solid-js';
import type { Annotation, AnnotationType, Point } from '../types';

interface AnnotationLayerProps {
  annotations: Annotation[];
  onAnnotationsChange: (annotations: Annotation[]) => void;
}

type Tool = 'select' | 'label' | 'arrow' | 'keep' | 'change';

export default function AnnotationLayer(props: AnnotationLayerProps) {
  const [activeTool, setActiveTool] = createSignal<Tool>('select');
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [isDrawing, setIsDrawing] = createSignal(false);
  const [currentShape, setCurrentShape] = createSignal<Annotation | null>(null);
  const [nextId, setNextId] = createSignal(1);

  // Dragging state
  const [dragging, setDragging] = createSignal<string | null>(null);
  const [dragId, setDragId] = createSignal<number | null>(null);
  const [dragOffset, setDragOffset] = createSignal({ x: 0, y: 0 });

  let containerRef: HTMLDivElement | undefined;

  // Initialize next ID based on existing annotations
  createEffect(() => {
    const maxId = Math.max(0, ...props.annotations.map(a => a.id));
    if (maxId >= nextId()) {
      setNextId(maxId + 1);
    }
  });

  // Get mouse position relative to container (0-100 scale)
  const getMousePos = (e: MouseEvent): Point => {
    if (!containerRef) return { x: 0, y: 0 };
    const rect = containerRef.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100
    };
  };

  // Handle mouse down - start drawing or select
  const handleMouseDown = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('.annotation-label') ||
        (e.target as HTMLElement).closest('.annotation-toolbar')) return;

    const pos = getMousePos(e);
    const tool = activeTool();

    if (tool === 'select') {
      setSelectedId(null);
      return;
    }

    setIsDrawing(true);
    setSelectedId(null);

    const id = nextId();

    if (tool === 'label') {
      // Add label immediately
      const newAnnotation: Annotation = {
        id,
        type: 'label',
        x: pos.x,
        y: pos.y,
        text: ''
      };
      props.onAnnotationsChange([...props.annotations, newAnnotation]);
      setSelectedId(id);
      setNextId(n => n + 1);
      setIsDrawing(false);
      return;
    }

    if (tool === 'arrow') {
      setCurrentShape({
        id,
        type: 'arrow',
        fromX: pos.x,
        fromY: pos.y,
        toX: pos.x,
        toY: pos.y
      });
    } else if (tool === 'keep' || tool === 'change') {
      setCurrentShape({
        id,
        type: tool,
        x: pos.x,
        y: pos.y,
        points: [pos]
      });
    }
  };

  // Handle mouse move
  const handleMouseMove = (e: MouseEvent) => {
    const pos = getMousePos(e);

    // Handle dragging existing annotation
    if (dragging() && dragId()) {
      const shapeId = dragId()!;
      const updated = props.annotations.map(a => {
        if (a.id !== shapeId) return a;

        if (a.type === 'label' || a.type === 'keep' || a.type === 'change') {
          return {
            ...a,
            x: pos.x - dragOffset().x,
            y: pos.y - dragOffset().y
          };
        } else if (a.type === 'arrow' && dragging() === 'from') {
          return { ...a, fromX: pos.x, fromY: pos.y };
        } else if (a.type === 'arrow' && dragging() === 'to') {
          return { ...a, toX: pos.x, toY: pos.y };
        } else if (a.type === 'arrow' && dragging() === 'whole') {
          const dx = a.toX! - a.fromX!;
          const dy = a.toY! - a.fromY!;
          const newFromX = pos.x - dragOffset().x;
          const newFromY = pos.y - dragOffset().y;
          return {
            ...a,
            fromX: newFromX,
            fromY: newFromY,
            toX: newFromX + dx,
            toY: newFromY + dy
          };
        }
        return a;
      });
      props.onAnnotationsChange(updated);
      return;
    }

    // Handle drawing new shape
    if (!isDrawing() || !currentShape()) return;

    const shape = currentShape()!;

    if (shape.type === 'arrow') {
      setCurrentShape({ ...shape, toX: pos.x, toY: pos.y });
    }
  };

  // Handle mouse up
  const handleMouseUp = () => {
    if (dragging()) {
      setDragging(null);
      setDragId(null);
      return;
    }

    if (!isDrawing() || !currentShape()) return;

    const shape = currentShape()!;
    let isValid = false;

    if (shape.type === 'arrow') {
      const dist = Math.sqrt(
        Math.pow(shape.toX! - shape.fromX!, 2) +
        Math.pow(shape.toY! - shape.fromY!, 2)
      );
      isValid = dist > 3;
    }

    if (isValid) {
      props.onAnnotationsChange([...props.annotations, shape]);
      setSelectedId(shape.id);
      setNextId(n => n + 1);
    }

    setCurrentShape(null);
    setIsDrawing(false);
  };

  // Start dragging
  const startDrag = (id: number, dragType: string, e: MouseEvent) => {
    e.stopPropagation();
    const pos = getMousePos(e);
    const shape = props.annotations.find(a => a.id === id);
    if (!shape) return;

    if (shape.type === 'label' || shape.type === 'keep' || shape.type === 'change') {
      setDragOffset({ x: pos.x - (shape.x || 0), y: pos.y - (shape.y || 0) });
    } else if (shape.type === 'arrow') {
      setDragOffset({ x: pos.x - (shape.fromX || 0), y: pos.y - (shape.fromY || 0) });
    }

    setDragging(dragType);
    setDragId(id);
    setSelectedId(id);
  };

  // Select annotation
  const selectAnnotation = (id: number, e?: MouseEvent) => {
    e?.stopPropagation();
    setSelectedId(id);
  };

  // Update annotation text
  const updateText = (id: number, text: string) => {
    const updated = props.annotations.map(a =>
      a.id === id ? { ...a, text } : a
    );
    props.onAnnotationsChange(updated);
  };

  // Delete annotation
  const deleteAnnotation = (id: number) => {
    props.onAnnotationsChange(props.annotations.filter(a => a.id !== id));
    if (selectedId() === id) setSelectedId(null);
  };

  // Handle keyboard
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId() && !(e.target as HTMLElement).matches('input')) {
      deleteAnnotation(selectedId()!);
    }
    if (e.key === 'Escape') {
      setActiveTool('select');
      setSelectedId(null);
      setCurrentShape(null);
      setIsDrawing(false);
    }
  };

  // Render arrow
  const renderArrow = (arrow: Annotation, isPreview = false) => {
    const isSelected = selectedId() === arrow.id;
    const angle = Math.atan2(arrow.toY! - arrow.fromY!, arrow.toX! - arrow.fromX!);
    const headLength = 2.5;

    const headX1 = arrow.toX! - headLength * Math.cos(angle - Math.PI / 6);
    const headY1 = arrow.toY! - headLength * Math.sin(angle - Math.PI / 6);
    const headX2 = arrow.toX! - headLength * Math.cos(angle + Math.PI / 6);
    const headY2 = arrow.toY! - headLength * Math.sin(angle + Math.PI / 6);

    return (
      <g
        class={`annotation-item ${isSelected ? 'selected' : ''}`}
        onClick={(e) => !isPreview && selectAnnotation(arrow.id, e)}
      >
        {!isPreview && (
          <line
            x1={arrow.fromX}
            y1={arrow.fromY}
            x2={arrow.toX}
            y2={arrow.toY}
            stroke="transparent"
            stroke-width="2"
            style={{ cursor: 'move' }}
            onMouseDown={(e) => startDrag(arrow.id, 'whole', e)}
          />
        )}
        <line
          x1={arrow.fromX}
          y1={arrow.fromY}
          x2={arrow.toX}
          y2={arrow.toY}
          stroke="#4f46e5"
          stroke-width="0.5"
          stroke-linecap="round"
          style={{ 'pointer-events': 'none' }}
        />
        <polygon
          points={`${arrow.toX},${arrow.toY} ${headX1},${headY1} ${headX2},${headY2}`}
          fill="#4f46e5"
          style={{ 'pointer-events': 'none' }}
        />
        {isSelected && !isPreview && (
          <>
            <circle
              cx={arrow.fromX}
              cy={arrow.fromY}
              r="1.5"
              fill="white"
              stroke="#4f46e5"
              stroke-width="0.3"
              style={{ cursor: 'grab' }}
              onMouseDown={(e) => startDrag(arrow.id, 'from', e)}
            />
            <circle
              cx={arrow.toX}
              cy={arrow.toY}
              r="1.5"
              fill="white"
              stroke="#4f46e5"
              stroke-width="0.3"
              style={{ cursor: 'grab' }}
              onMouseDown={(e) => startDrag(arrow.id, 'to', e)}
            />
          </>
        )}
      </g>
    );
  };

  return (
    <div
      ref={containerRef}
      class={`annotation-layer ${activeTool() !== 'select' ? 'drawing' : ''}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Toolbar */}
      <div class="annotation-toolbar">
        <button
          class={`tool-btn ${activeTool() === 'select' ? 'active' : ''}`}
          onClick={() => setActiveTool('select')}
          title="Velg"
        >
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path d="M5 3L19 12L12 13L9 20L5 3Z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/>
          </svg>
        </button>
        <button
          class={`tool-btn ${activeTool() === 'label' ? 'active' : ''}`}
          onClick={() => setActiveTool('label')}
          title="Rometikett"
        >
          <svg viewBox="0 0 24 24" width="20" height="20">
            <text x="12" y="17" text-anchor="middle" font-size="14" font-weight="bold" fill="currentColor">T</text>
          </svg>
        </button>
        <button
          class={`tool-btn ${activeTool() === 'arrow' ? 'active' : ''}`}
          onClick={() => setActiveTool('arrow')}
          title="Pil"
        >
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path d="M4 20L20 4M20 4H8M20 4V16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button
          class={`tool-btn ${activeTool() === 'keep' ? 'active' : ''}`}
          onClick={() => setActiveTool('keep')}
          title="Behold som det er"
          style={{ color: activeTool() === 'keep' ? 'white' : '#10b981' }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button
          class={`tool-btn ${activeTool() === 'change' ? 'active' : ''}`}
          onClick={() => setActiveTool('change')}
          title="Marker for endring"
          style={{ color: activeTool() === 'change' ? 'white' : '#f59e0b' }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>

      {/* SVG layer for shapes */}
      <svg class="annotation-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <For each={props.annotations}>
          {(annotation) => (
            <Show when={annotation.type === 'arrow'}>
              {renderArrow(annotation)}
            </Show>
          )}
        </For>
        <Show when={currentShape()?.type === 'arrow'}>
          {renderArrow(currentShape()!, true)}
        </Show>
      </svg>

      {/* Label annotations */}
      <Index each={props.annotations}>
        {(annotation) => (
          <Show when={annotation().type === 'label'}>
            <div
              class={`annotation-label ${selectedId() === annotation().id ? 'selected' : ''}`}
              style={{
                left: `${annotation().x}%`,
                top: `${annotation().y}%`
              }}
              onMouseDown={(e) => startDrag(annotation().id, 'whole', e)}
              onClick={(e) => selectAnnotation(annotation().id, e)}
            >
              <input
                type="text"
                placeholder="Romnavn..."
                value={annotation().text || ''}
                onInput={(e) => updateText(annotation().id, e.currentTarget.value)}
                onKeyDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              />
              <Show when={selectedId() === annotation().id}>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteAnnotation(annotation().id); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#dc2626',
                    cursor: 'pointer',
                    padding: '0 0.25rem',
                    'font-size': '1rem'
                  }}
                >
                  ×
                </button>
              </Show>
            </div>
          </Show>
        )}
      </Index>

      {/* Keep/Change markers */}
      <Index each={props.annotations}>
        {(annotation) => (
          <Show when={annotation().type === 'keep' || annotation().type === 'change'}>
            <div
              class={`annotation-label ${annotation().type} ${selectedId() === annotation().id ? 'selected' : ''}`}
              style={{
                left: `${annotation().x}%`,
                top: `${annotation().y}%`
              }}
              onMouseDown={(e) => startDrag(annotation().id, 'whole', e)}
              onClick={(e) => selectAnnotation(annotation().id, e)}
            >
              <input
                type="text"
                placeholder={annotation().type === 'keep' ? 'Behold...' : 'Endre...'}
                value={annotation().text || ''}
                onInput={(e) => updateText(annotation().id, e.currentTarget.value)}
                onKeyDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              />
              <Show when={selectedId() === annotation().id}>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteAnnotation(annotation().id); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#dc2626',
                    cursor: 'pointer',
                    padding: '0 0.25rem',
                    'font-size': '1rem'
                  }}
                >
                  ×
                </button>
              </Show>
            </div>
          </Show>
        )}
      </Index>

      {/* Hint */}
      <Show when={props.annotations.length === 0 && !isDrawing() && activeTool() === 'select'}>
        <div class="annotation-hint">
          Velg et verktøy for å legge til merknader på plantegningen
        </div>
      </Show>
    </div>
  );
}
