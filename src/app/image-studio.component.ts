import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, EventEmitter, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

type Mode = 'text-to-image' | 'image-to-image';
type AspectRatio = '1:1' | '4:3' | '3:4' | '16:9' | '9:16';
type StylePreset = 'auto' | 'product' | 'cartoon' | 'cinematic' | 'ui-concept' | 'minimal';
type GenerationModel = 'flux' | 'turbo';

type GenerateResponse = {
  imageUrl: string;
  provider: string;
  model: string;
  promptUsed?: string;
};

type HistoryItem = GenerateResponse & {
  id: string;
  mode: Mode;
  style: StylePreset;
  aspectRatio: AspectRatio;
  prompt: string;
  selectedModel: GenerationModel;
};

type StoredState = {
  mode: Mode;
  prompt: string;
  aspectRatio: AspectRatio | null;
  style: StylePreset | null;
  selectedModel: GenerationModel;
  referencePreview: string | null;
  result: GenerateResponse | null;
  history: HistoryItem[];
  selectedTweaks: string[];
};

const STORAGE_KEY = 'image-studio-state-v1';
const styleDescriptions: Record<StylePreset, string> = {
  auto: 'Deja que el prompt mande.',
  product: 'Más limpio, luz de estudio, fondo controlado.',
  cartoon: 'Formas suaves, color más amable, look divertido.',
  cinematic: 'Más dramatismo, contraste y composición hero.',
  'ui-concept': 'Útil para concepts de producto y branding.',
  minimal: 'Menos ruido visual, foco en la forma principal.',
};
const quickTweaks = [
  'fondo blanco puro',
  'sombras suaves',
  'composición centrada',
  'detalle alto',
  'acabado glossy',
  'estética premium',
] as const;

function readStoredState(): StoredState | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredState) : null;
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-image-studio',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './image-studio.component.html',
})
export class ImageStudioComponent {
  @Output() back = new EventEmitter<void>();

  readonly quickTweaks = quickTweaks;
  readonly styles = ['auto', 'product', 'cartoon', 'cinematic', 'ui-concept', 'minimal'] as const;
  readonly aspectRatios = ['1:1', '4:3', '3:4', '16:9', '9:16'] as const;
  readonly models: { value: GenerationModel; label: string; note: string }[] = [
    { value: 'flux', label: 'Pollinations Flux', note: 'Mejor opción general dentro del modo gratis.' },
    { value: 'turbo', label: 'Pollinations Turbo', note: 'Más rápido, útil para pruebas y exploración.' },
  ];
  readonly styleDescriptions = styleDescriptions;

  mode: Mode = 'text-to-image';
  prompt = 'Una banana 3D cartoon, redondeada, brillante, centrada, fondo blanco puro, sombra suave.';
  aspectRatio: AspectRatio | null = '1:1';
  style: StylePreset | null = 'cartoon';
  selectedModel: GenerationModel = 'flux';
  referenceFile: File | null = null;
  referencePreview: string | null = null;
  result: GenerateResponse | null = null;
  history: HistoryItem[] = [];
  loading = false;
  error: string | null = null;
  notice: string | null = null;
  selectedTweaks: string[] = [];
  isDragActive = false;

  constructor(private readonly http: HttpClient) {
    const stored = readStoredState();
    if (!stored) return;
    this.mode = stored.mode;
    this.prompt = stored.prompt;
    this.aspectRatio = stored.aspectRatio;
    this.style = stored.style;
    this.selectedModel = stored.selectedModel ?? 'flux';
    this.referencePreview = stored.referencePreview;
    this.result = stored.result;
    this.history = stored.history;
    this.selectedTweaks = stored.selectedTweaks;
  }

  get canSubmit() {
    if (!this.prompt.trim()) return false;
    if (this.mode === 'image-to-image' && !this.referenceFile && !this.referencePreview) return false;
    return true;
  }
  get effectiveStyle(): StylePreset { return this.style ?? 'auto'; }
  get effectiveAspectRatio(): AspectRatio { return this.aspectRatio ?? '1:1'; }
  get selectedModelNote() { return this.models.find((item) => item.value === this.selectedModel)?.note ?? ''; }
  get enhancedPrompt() {
    const styleParts: Record<StylePreset, string> = {
      auto: '',
      product: 'clean product render, studio lighting, polished composition',
      cartoon: 'cute cartoon-style 3D render, rounded shapes, playful look',
      cinematic: 'cinematic lighting, stronger contrast, premium composition',
      'ui-concept': 'design concept render, polished, product-focused, modern visual system',
      minimal: 'minimal composition, reduced clutter, clean negative space',
    };
    return [this.prompt.trim(), this.style ? styleParts[this.style] : ''].filter(Boolean).join(', ');
  }

  persistState(next: Partial<StoredState>) {
    const current: StoredState = {
      mode: this.mode,
      prompt: this.prompt,
      aspectRatio: this.aspectRatio,
      style: this.style,
      selectedModel: this.selectedModel,
      referencePreview: this.referencePreview,
      result: this.result,
      history: this.history,
      selectedTweaks: this.selectedTweaks,
      ...next,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  }

  chipClasses(isActive: boolean, tone: 'orange' | 'dark' = 'dark') {
    if (isActive) return tone === 'orange'
      ? 'border border-orange-500 bg-orange-500 text-white shadow-[0_0_0_3px_rgba(249,115,22,0.18)]'
      : 'border border-slate-950 bg-slate-950 text-white shadow-[0_0_0_3px_rgba(15,23,42,0.12)]';
    return 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-100 active:scale-[0.99]';
  }
  chipIconClasses(isActive: boolean) {
    return isActive ? 'border-white/70 bg-white/15 text-white' : 'border-slate-300 bg-white text-transparent';
  }

  onPromptChange(nextPrompt: string) { this.prompt = nextPrompt; this.persistState({ prompt: nextPrompt }); }
  selectStyle(preset: StylePreset) {
    const nextStyle = this.style === preset ? null : preset;
    this.style = nextStyle; this.persistState({ style: nextStyle });
    this.notice = nextStyle ? `Estilo ${preset} seleccionado.` : `Estilo ${preset} deseleccionado.`;
  }
  selectAspectRatio(ratio: AspectRatio) {
    const nextRatio = this.aspectRatio === ratio ? null : ratio;
    this.aspectRatio = nextRatio; this.persistState({ aspectRatio: nextRatio });
    this.notice = nextRatio ? `Formato ${ratio} seleccionado.` : `Formato ${ratio} deseleccionado.`;
  }
  toggleTweak(tweak: string) {
    const isActive = this.selectedTweaks.includes(tweak);
    const nextTweaks = isActive ? this.selectedTweaks.filter((item) => item !== tweak) : [...this.selectedTweaks, tweak];
    const lowered = this.prompt.toLowerCase();
    const tweakLower = tweak.toLowerCase();
    this.prompt = isActive ? (() => {
      const index = lowered.indexOf(tweakLower);
      if (index === -1) return this.prompt;
      const before = this.prompt.slice(0, index).replace(/[,.\s]+$/, '');
      const after = this.prompt.slice(index + tweak.length).replace(/^[,.\s]+/, '');
      return [before, after].filter(Boolean).join(', ');
    })() : this.prompt.trim() ? `${this.prompt.replace(/[,.\s]+$/, '')}, ${tweak}` : tweak;
    this.selectedTweaks = nextTweaks;
    this.persistState({ prompt: this.prompt, selectedTweaks: nextTweaks });
    this.notice = isActive ? `Quité: ${tweak}` : `Añadí: ${tweak}`;
  }
  onModeChange(mode: Mode) { this.mode = mode; this.result = null; this.error = null; this.persistState({ mode, result: null }); }
  onModelChange(model: GenerationModel) {
    this.selectedModel = model; this.result = null; this.error = null;
    this.persistState({ selectedModel: model, result: null });
    this.notice = `Modelo ${this.models.find((item) => item.value === model)?.label ?? model} seleccionado.`;
  }
  onDragOver(event: DragEvent) { event.preventDefault(); this.isDragActive = true; }
  onDragLeave(event: DragEvent) { event.preventDefault(); this.isDragActive = false; }
  onDrop(event: DragEvent) { event.preventDefault(); this.isDragActive = false; this.onFileChange(event.dataTransfer?.files?.[0] ?? null); }
  onFileInput(event: Event) { this.onFileChange((event.target as HTMLInputElement).files?.[0] ?? null); }
  onFileChange(file: File | null) {
    this.referenceFile = file; this.result = null; this.error = null;
    if (!file) { this.referencePreview = null; this.persistState({ referencePreview: null, result: null }); return; }
    const reader = new FileReader();
    reader.onload = () => { this.referencePreview = typeof reader.result === 'string' ? reader.result : null; this.persistState({ referencePreview: this.referencePreview, result: null }); };
    reader.readAsDataURL(file);
  }
  clearAll() {
    this.prompt = ''; this.referenceFile = null; this.referencePreview = null; this.result = null; this.selectedTweaks = []; this.error = null; this.notice = 'Campos limpiados.';
    this.persistState({ prompt: '', referencePreview: null, selectedTweaks: [], result: null });
  }
  async copyPrompt() {
    try { await navigator.clipboard.writeText(this.enhancedPrompt || this.prompt); this.notice = 'Prompt copiado.'; }
    catch { this.error = 'No pude copiar el prompt automáticamente.'; }
  }
  async downloadResult() {
    if (!this.result?.imageUrl) return;
    const link = document.createElement('a');
    link.href = this.result.imageUrl; link.download = `image-studio-${Date.now()}.png`; link.target = '_blank'; link.rel = 'noreferrer'; link.click();
  }
  async reuseHistory(item: HistoryItem) {
    this.prompt = item.prompt; this.mode = item.mode; this.style = item.style; this.aspectRatio = item.aspectRatio; this.selectedModel = item.selectedModel;
    this.result = { imageUrl: item.imageUrl, provider: item.provider, model: item.model, promptUsed: item.promptUsed };
    this.persistState({ prompt: item.prompt, mode: item.mode, style: item.style, aspectRatio: item.aspectRatio, selectedModel: item.selectedModel, result: this.result });
    this.notice = 'Generación recuperada del historial.';
  }
  async handleGenerate() {
    if (!this.canSubmit) return;
    this.loading = true; this.error = null; this.notice = null;
    try {
      const body = new FormData();
      body.append('prompt', this.prompt.trim()); body.append('mode', this.mode); body.append('style', this.effectiveStyle); body.append('aspectRatio', this.effectiveAspectRatio); body.append('model', this.selectedModel);
      if (this.referenceFile) body.append('reference', this.referenceFile);
      const response = await firstValueFrom(this.http.post<GenerateResponse>('/api/generate', body));
      this.result = response;
      const nextHistory: HistoryItem[] = [{ id: crypto.randomUUID(), ...response, mode: this.mode, style: this.effectiveStyle, aspectRatio: this.effectiveAspectRatio, prompt: this.prompt.trim(), selectedModel: this.selectedModel }, ...this.history].slice(0, 8);
      this.history = nextHistory;
      this.persistState({ result: response, history: nextHistory, style: this.style, aspectRatio: this.aspectRatio, selectedModel: this.selectedModel });
      this.notice = 'Imagen generada.';
    } catch (error: unknown) {
      const apiError = typeof error === 'object' && error && 'error' in error ? (error as { error?: { error?: string; details?: { body?: unknown } } }).error : null;
      const detailMessage = apiError?.details?.body && typeof apiError.details.body === 'object' && apiError.details.body && 'detail' in apiError.details.body ? String((apiError.details.body as { detail?: unknown }).detail) : null;
      this.error = apiError?.error ?? detailMessage ?? 'No pude generar la imagen.';
    } finally { this.loading = false; }
  }
}
