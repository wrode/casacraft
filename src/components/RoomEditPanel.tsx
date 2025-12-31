import { createSignal, Show } from 'solid-js';
import type { DetectedRoom } from '../types';

interface RoomEditPanelProps {
  room: DetectedRoom;
  onInpaint: (prompt: string, strength: number) => void;
  onClose: () => void;
  isProcessing: boolean;
}

// Preset prompts for common room modifications
const PRESETS = [
  { label: 'Modern', prompt: 'modern minimalist furniture, clean lines, neutral colors' },
  { label: 'Cozy', prompt: 'warm cozy atmosphere, soft textiles, warm lighting' },
  { label: 'Luxury', prompt: 'luxury high-end furniture, elegant decor, premium materials' },
  { label: 'Scandinavian', prompt: 'scandinavian style, light wood, plants, hygge' },
  { label: 'Industrial', prompt: 'industrial style, exposed brick, metal accents' },
  { label: 'Empty', prompt: 'empty room, no furniture, clean floor' },
];

export default function RoomEditPanel(props: RoomEditPanelProps) {
  const [prompt, setPrompt] = createSignal('');
  const [strength, setStrength] = createSignal(0.8);

  const handlePresetClick = (presetPrompt: string) => {
    setPrompt(presetPrompt);
  };

  const handleSubmit = () => {
    if (prompt().trim()) {
      props.onInpaint(prompt(), strength());
    }
  };

  return (
    <div class="room-edit-panel">
      <div class="panel-header">
        <h3>Edit: {props.room.label}</h3>
        <button class="close-btn" onClick={props.onClose}>×</button>
      </div>

      <div class="panel-content">
        {/* Presets */}
        <div class="presets-section">
          <label>Quick Styles</label>
          <div class="presets-grid">
            {PRESETS.map((preset) => (
              <button
                class={`preset-btn ${prompt() === preset.prompt ? 'active' : ''}`}
                onClick={() => handlePresetClick(preset.prompt)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom prompt */}
        <div class="prompt-section">
          <label>Description</label>
          <textarea
            placeholder="Describe what you want in this room..."
            value={prompt()}
            onInput={(e) => setPrompt(e.currentTarget.value)}
            rows={3}
          />
        </div>

        {/* Strength slider */}
        <div class="strength-section">
          <label>
            Change Strength: {Math.round(strength() * 100)}%
          </label>
          <input
            type="range"
            min="0.3"
            max="1"
            step="0.05"
            value={strength()}
            onInput={(e) => setStrength(parseFloat(e.currentTarget.value))}
          />
          <div class="strength-labels">
            <span>Subtle</span>
            <span>Strong</span>
          </div>
        </div>

        {/* Action buttons */}
        <div class="action-buttons">
          <button
            class="btn-secondary"
            onClick={props.onClose}
            disabled={props.isProcessing}
          >
            Cancel
          </button>
          <button
            class="btn-primary"
            onClick={handleSubmit}
            disabled={!prompt().trim() || props.isProcessing}
          >
            <Show when={props.isProcessing} fallback="Apply Changes">
              <span class="spinner-small" /> Processing...
            </Show>
          </button>
        </div>
      </div>
    </div>
  );
}
