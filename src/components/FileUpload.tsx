import { createSignal, Show } from 'solid-js';
import { validateFile } from '../utils/fileUtils';

interface FileUploadProps {
  onFileSelect: (dataUrl: string, fileName: string) => void;
}

export default function FileUpload(props: FileUploadProps) {
  const [dragOver, setDragOver] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [preview, setPreview] = createSignal<{ dataUrl: string; name: string; size: string } | null>(null);

  let fileInputRef: HTMLInputElement | undefined;

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleFile = async (file: File) => {
    setError(null);
    setPreview(null);

    const validation = await validateFile(file);

    if (!validation.valid) {
      setError(validation.error || 'Ukjent feil');
      return;
    }

    setPreview({
      dataUrl: validation.dataUrl!,
      name: file.name,
      size: formatFileSize(file.size)
    });
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const file = e.dataTransfer?.files[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleInputChange = (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleContinue = () => {
    const p = preview();
    if (p) {
      props.onFileSelect(p.dataUrl, p.name);
    }
  };

  const handleClear = () => {
    setPreview(null);
    setError(null);
    if (fileInputRef) {
      fileInputRef.value = '';
    }
  };

  return (
    <div
      class={`upload-zone ${dragOver() ? 'drag-over' : ''} ${preview() ? 'has-file' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={() => !preview() && fileInputRef?.click()}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/avif"
        onChange={handleInputChange}
        style={{ display: 'none' }}
      />

      <Show when={!preview()}>
        <svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 4v12m0-12L8 8m4-4l4 4" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <h3>Dra og slipp plantegning her</h3>
        <p>eller</p>
        <button class="upload-button" type="button">
          Velg fil
        </button>
        <p class="upload-formats">PNG, JPEG eller AVIF, maks 10 MB</p>
      </Show>

      <Show when={preview()}>
        <div class="upload-preview" onClick={(e) => e.stopPropagation()}>
          <img src={preview()!.dataUrl} alt="Forhåndsvisning" />
          <div class="upload-preview-info">
            <h4>{preview()!.name}</h4>
            <p>{preview()!.size}</p>
            <div class="upload-preview-actions">
              <button class="btn-secondary" onClick={handleClear}>
                Fjern
              </button>
              <button class="btn-primary" onClick={handleContinue}>
                Fortsett
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={error()}>
        <div class="error-message">
          {error()}
        </div>
      </Show>
    </div>
  );
}
