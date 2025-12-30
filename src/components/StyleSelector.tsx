import { For } from 'solid-js';
import type { StylePreset } from '../types';
import { STYLE_CONFIGS, getStyleConfig } from '../utils/promptBuilder';

interface StyleSelectorProps {
  value: StylePreset;
  onChange: (style: StylePreset) => void;
}

export default function StyleSelector(props: StyleSelectorProps) {
  const currentConfig = () => getStyleConfig(props.value);

  return (
    <div class="sidebar-section">
      <h3>Stil</h3>
      <select
        class="style-select"
        value={props.value}
        onChange={(e) => props.onChange(e.currentTarget.value as StylePreset)}
      >
        <For each={STYLE_CONFIGS}>
          {(style) => (
            <option value={style.value}>
              {style.label}
            </option>
          )}
        </For>
      </select>
      <p class="style-description">
        {currentConfig().description}
      </p>
    </div>
  );
}
