import { For, Show } from 'solid-js';
import type { DetectedRoom } from '../types';

interface RoomOverlayProps {
  rooms: DetectedRoom[];
  selectedRoomId: string | null;
  onRoomClick: (room: DetectedRoom) => void;
  imageWidth: number;
  imageHeight: number;
}

export default function RoomOverlay(props: RoomOverlayProps) {
  // Convert polygon points to SVG path
  const polygonToPath = (polygon: { x: number; y: number }[]): string => {
    if (polygon.length === 0) return '';

    const points = polygon.map((p, i) => {
      const cmd = i === 0 ? 'M' : 'L';
      return `${cmd} ${p.x} ${p.y}`;
    });

    return points.join(' ') + ' Z';
  };

  return (
    <svg
      class="room-overlay"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <For each={props.rooms}>
        {(room) => {
          const isSelected = props.selectedRoomId === room.id;
          const path = polygonToPath(room.polygon);

          return (
            <g
              class={`room-region ${isSelected ? 'selected' : ''}`}
              onClick={() => props.onRoomClick(room)}
            >
              {/* Clickable area */}
              <path
                d={path}
                class="room-path"
                fill={isSelected ? 'rgba(79, 70, 229, 0.3)' : 'rgba(79, 70, 229, 0.1)'}
                stroke={isSelected ? '#4f46e5' : 'rgba(79, 70, 229, 0.5)'}
                stroke-width={isSelected ? '0.5' : '0.2'}
              />

              {/* Room label */}
              <text
                x={room.bbox.x + room.bbox.width / 2}
                y={room.bbox.y + room.bbox.height / 2}
                class="room-label"
                text-anchor="middle"
                dominant-baseline="middle"
                fill={isSelected ? '#4f46e5' : 'rgba(79, 70, 229, 0.8)'}
                font-size="3"
                font-weight={isSelected ? '600' : '500'}
              >
                {room.label}
              </text>

              {/* Confidence indicator */}
              <Show when={isSelected}>
                <text
                  x={room.bbox.x + room.bbox.width / 2}
                  y={room.bbox.y + room.bbox.height / 2 + 4}
                  class="room-confidence"
                  text-anchor="middle"
                  dominant-baseline="middle"
                  fill="rgba(79, 70, 229, 0.6)"
                  font-size="2"
                >
                  {Math.round(room.confidence * 100)}% confidence
                </text>
              </Show>
            </g>
          );
        }}
      </For>
    </svg>
  );
}
