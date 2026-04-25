"use client";

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import clsx from "clsx";
import {
  Copy,
  Download,
  History,
  ImagePlus,
  LoaderCircle,
  RefreshCcw,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
} from "lucide-react";
import { useDropzone } from "react-dropzone";

type Mode = "text-to-image" | "image-to-image";
type AspectRatio = "1:1" | "4:3" | "3:4" | "16:9" | "9:16";
type StylePreset = "auto" | "product" | "cartoon" | "cinematic" | "ui-concept" | "minimal";

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
};

type StoredState = {
  mode: Mode;
  prompt: string;
  aspectRatio: AspectRatio | null;
  style: StylePreset | null;
  referencePreview: string | null;
  result: GenerateResponse | null;
  history: HistoryItem[];
  selectedIdea: string;
  selectedTweaks: string[];
};

const STORAGE_KEY = "image-studio-state-v1";

const promptIdeas = [
  "Una banana 3D cartoon sobre fondo blanco, glossy, suave y simpática.",
  "Pantalla hero para app de diseño con estética premium, gradientes suaves y mockup flotante.",
  "Ilustración isométrica de dashboard SaaS con look limpio, moderno y profesional.",
  "Mascota minimalista para startup AI, amigable, memorable y usable como ícono.",
] as const;

const styleDescriptions: Record<StylePreset, string> = {
  auto: "Deja que el prompt mande.",
  product: "Más limpio, luz de estudio, fondo controlado.",
  cartoon: "Formas suaves, color más amable, look divertido.",
  cinematic: "Más dramatismo, contraste y composición hero.",
  "ui-concept": "Útil para concepts de producto y branding.",
  minimal: "Menos ruido visual, foco en la forma principal.",
};

const quickTweaks = [
  "fondo blanco puro",
  "sombras suaves",
  "composición centrada",
  "detalle alto",
  "acabado glossy",
  "estética premium",
] as const;

function getSelectableChipClasses(isActive: boolean, tone: "orange" | "dark" = "dark") {
  if (isActive) {
    return tone === "orange"
      ? "border border-orange-500 bg-orange-500 text-white shadow-[0_0_0_3px_rgba(249,115,22,0.18)]"
      : "border border-slate-950 bg-slate-950 text-white shadow-[0_0_0_3px_rgba(15,23,42,0.12)]";
  }

  return "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-100 active:scale-[0.99]";
}

function getSelectableChipIconClasses(isActive: boolean) {
  return isActive
    ? "border-white/70 bg-white/15 text-white"
    : "border-slate-300 bg-white text-transparent";
}

function readStoredState(): StoredState | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredState;
  } catch {
    return null;
  }
}

export default function Home() {
  const stored = readStoredState();

  const [mode, setMode] = useState<Mode>(stored?.mode ?? "text-to-image");
  const [prompt, setPrompt] = useState<string>(stored?.prompt ?? promptIdeas[0]);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio | null>(stored?.aspectRatio ?? "1:1");
  const [style, setStyle] = useState<StylePreset | null>(stored?.style ?? "cartoon");
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(stored?.referencePreview ?? null);
  const [result, setResult] = useState<GenerateResponse | null>(stored?.result ?? null);
  const [history, setHistory] = useState<HistoryItem[]>(stored?.history ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedIdea, setSelectedIdea] = useState<string>(stored?.selectedIdea ?? promptIdeas[0]);
  const [selectedTweaks, setSelectedTweaks] = useState<string[]>(stored?.selectedTweaks ?? []);

  const onFileChange = (file: File | null) => {
    setReferenceFile(file);
    setResult(null);
    setError(null);

    if (!file) {
      setReferencePreview(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setReferencePreview(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      "image/*": [".png", ".jpg", ".jpeg", ".webp"],
    },
    maxFiles: 1,
    multiple: false,
    onDrop: (files) => onFileChange(files[0] ?? null),
  });

  const canSubmit = useMemo(() => {
    if (!prompt.trim()) return false;
    if (mode === "image-to-image" && !referenceFile && !referencePreview) return false;
    return true;
  }, [mode, prompt, referenceFile, referencePreview]);

  const effectiveStyle = style ?? "auto";
  const effectiveAspectRatio = aspectRatio ?? "1:1";

  const enhancedPrompt = useMemo(() => {
    const styleParts: Record<StylePreset, string> = {
      auto: "",
      product: "clean product render, studio lighting, polished composition",
      cartoon: "cute cartoon-style 3D render, rounded shapes, playful look",
      cinematic: "cinematic lighting, stronger contrast, premium composition",
      "ui-concept": "design concept render, polished, product-focused, modern visual system",
      minimal: "minimal composition, reduced clutter, clean negative space",
    };

    return [prompt.trim(), style ? styleParts[style] : ""].filter(Boolean).join(", ");
  }, [prompt, style]);

  const persistState = (next: Partial<StoredState>) => {
    if (typeof window === "undefined") return;

    const current: StoredState = {
      mode,
      prompt,
      aspectRatio,
      style,
      referencePreview,
      result,
      history,
      selectedIdea,
      selectedTweaks,
      ...next,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  };

  function selectIdea(idea: string) {
    setPrompt(idea);
    setSelectedIdea(idea);
    setSelectedTweaks([]);
    persistState({ prompt: idea, selectedIdea: idea, selectedTweaks: [] });
    setNotice("Idea rápida aplicada.");
  }

  function selectStyle(preset: StylePreset) {
    const nextStyle = style === preset ? null : preset;
    setStyle(nextStyle);
    persistState({ style: nextStyle });
    setNotice(nextStyle ? `Estilo ${preset} seleccionado.` : `Estilo ${preset} deseleccionado.`);
  }

  function selectAspectRatio(ratio: AspectRatio) {
    const nextRatio = aspectRatio === ratio ? null : ratio;
    setAspectRatio(nextRatio);
    persistState({ aspectRatio: nextRatio });
    setNotice(nextRatio ? `Formato ${ratio} seleccionado.` : `Formato ${ratio} deseleccionado.`);
  }

  function toggleTweak(tweak: string) {
    setSelectedIdea("");
    setSelectedTweaks((current) => {
      const isActive = current.includes(tweak);
      const nextTweaks = isActive ? current.filter((item) => item !== tweak) : [...current, tweak];

      setPrompt((currentPrompt) => {
        const lowered = currentPrompt.toLowerCase();
        const tweakLower = tweak.toLowerCase();

        const nextPrompt = (() => {
          if (isActive) {
            const index = lowered.indexOf(tweakLower);
            if (index === -1) return currentPrompt;
            const before = currentPrompt.slice(0, index).replace(/[,.\s]+$/, "");
            const after = currentPrompt.slice(index + tweak.length).replace(/^[,.\s]+/, "");
            return [before, after].filter(Boolean).join(", ");
          }

          return currentPrompt.trim() ? `${currentPrompt.replace(/[,.\s]+$/, "")}, ${tweak}` : tweak;
        })();

        persistState({ prompt: nextPrompt, selectedTweaks: nextTweaks, selectedIdea: "" });
        return nextPrompt;
      });

      setNotice(isActive ? `Quité: ${tweak}` : `Añadí: ${tweak}`);
      return nextTweaks;
    });
  }

  async function handleGenerate() {
    if (!canSubmit) return;

    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const body = new FormData();
      body.append("prompt", prompt.trim());
      body.append("mode", mode);
      body.append("style", effectiveStyle);
      body.append("aspectRatio", effectiveAspectRatio);
      if (referenceFile) body.append("reference", referenceFile);

      const response = await fetch("/api/generate", {
        method: "POST",
        body,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo generar la imagen.");
      }

      const nextHistory = [
        {
          id: crypto.randomUUID(),
          ...data,
          prompt: prompt.trim(),
          mode,
          style: effectiveStyle,
          aspectRatio: effectiveAspectRatio,
        },
        ...history,
      ].slice(0, 8);

      setResult(data);
      setHistory(nextHistory);
      persistState({ result: data, history: nextHistory });
      setNotice("Imagen generada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado.");
    } finally {
      setLoading(false);
    }
  }

  function applyHistoryItem(item: HistoryItem) {
    const nextTweaks = quickTweaks.filter((tweak) => item.prompt.toLowerCase().includes(tweak.toLowerCase()));
    setPrompt(item.prompt);
    setMode(item.mode);
    setStyle(item.style);
    setAspectRatio(item.aspectRatio);
    setResult(item);
    setSelectedIdea("");
    setSelectedTweaks(nextTweaks);
    persistState({
      prompt: item.prompt,
      mode: item.mode,
      style: item.style,
      aspectRatio: item.aspectRatio,
      result: item,
      selectedIdea: "",
      selectedTweaks: nextTweaks,
    });
    setNotice("Historial aplicado al editor.");
  }

  async function copyPromptUsed() {
    if (!result?.promptUsed) return;
    try {
      await navigator.clipboard.writeText(result.promptUsed);
      setNotice("Prompt copiado.");
    } catch {
      setError("No pude copiar el prompt automáticamente.");
    }
  }

  async function downloadResult() {
    if (!result?.imageUrl) return;
    try {
      const response = await fetch(result.imageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "image-studio-result.png";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setNotice("Descarga iniciada.");
    } catch {
      setError("No pude descargar la imagen.");
    }
  }

  async function loadResultAsReference() {
    if (!result?.imageUrl) return;
    try {
      const response = await fetch(result.imageUrl);
      const blob = await response.blob();
      const extension = blob.type.split("/")[1] || "png";
      const file = new File([blob], `reference.${extension}`, { type: blob.type || "image/png" });
      onFileChange(file);
      setMode("image-to-image");
      persistState({ mode: "image-to-image" });
      setNotice("Resultado cargado como referencia.");
    } catch {
      setError("No pude reutilizar la imagen como referencia.");
    }
  }

  async function createVariation() {
    if (!result?.imageUrl) return;
    await loadResultAsReference();
    setPrompt((current) => {
      const nextPrompt = `${current.replace(/[,.\s]+$/, "")}, nueva variación coherente`;
      persistState({ prompt: nextPrompt });
      return nextPrompt;
    });
    setNotice("Resultado preparado para una variación. Ahora genera de nuevo.");
  }

  function clearHistory() {
    setHistory([]);
    persistState({ history: [] });
    setNotice("Historial limpiado.");
  }

  function resetEditor() {
    setPrompt("");
    setReferenceFile(null);
    setReferencePreview(null);
    setSelectedIdea("");
    setSelectedTweaks([]);
    setError(null);
    persistState({ prompt: "", referencePreview: null, selectedIdea: "", selectedTweaks: [], result: null });
    setNotice("Editor limpio.");
  }

  function clearSavedState() {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    setMode("text-to-image");
    setPrompt(promptIdeas[0]);
    setAspectRatio("1:1");
    setStyle("cartoon");
    setReferenceFile(null);
    setReferencePreview(null);
    setResult(null);
    setHistory([]);
    setSelectedIdea(promptIdeas[0]);
    setSelectedTweaks([]);
    setError(null);
    setNotice("Estado local eliminado.");
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff7ed_0%,#ffffff_24%,#f8fafc_100%)] text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-6 md:px-8 md:py-8">
        <header className="rounded-[32px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_80px_rgba(15,23,42,0.08)] backdrop-blur md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-orange-600">
                <Sparkles className="h-4 w-4" />
                Image Studio · modo producto
              </div>
              <div className="max-w-3xl space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950 md:text-5xl">
                  Una interfaz más tipo ChatGPT Images: directa, usable y con mejor control creativo.
                </h1>
                <p className="text-sm leading-7 text-slate-600 md:text-base">
                  Aquí el objetivo no es solo generar, sino iterar bien: presets, formato, prompt asistido, referencia visual, resultado claro e historial reutilizable.
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 text-sm text-orange-900">
              <div className="font-medium">Backend listo para fal / FLUX</div>
              <div className="text-orange-700">Text-to-image + image-to-image</div>
            </div>
          </div>
        </header>

        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-6 rounded-[32px] border border-slate-200 bg-white p-5 shadow-[0_16px_48px_rgba(15,23,42,0.06)] md:p-7">
            <div className="flex flex-wrap gap-3">
              {([
                ["text-to-image", "Texto a imagen"],
                ["image-to-image", "Imagen a imagen"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setMode(value);
                    persistState({ mode: value });
                  }}
                  className={clsx(
                    "rounded-full px-4 py-2 text-sm font-medium transition",
                    mode === value ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <label className="block space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-700">Prompt principal</span>
                <span className="text-xs text-slate-400">Ve al punto: sujeto + estilo + fondo + luz + composición</span>
              </div>
              <textarea
                value={prompt}
                onChange={(event) => {
                  const nextPrompt = event.target.value;
                  setPrompt(nextPrompt);
                  setSelectedIdea("");
                  persistState({ prompt: nextPrompt, selectedIdea: "" });
                }}
                placeholder="Ej. Una banana 3D cartoon, redondeada, brillante, centrada, fondo blanco puro, sombra suave."
                className="min-h-40 w-full rounded-[28px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-900 outline-none transition focus:border-orange-400 focus:bg-white"
              />
            </label>

            <div className="space-y-3">
              <div className="text-sm font-medium text-slate-700">Ideas rápidas</div>
              <div className="flex flex-wrap gap-2">
                {promptIdeas.map((idea) => (
                  <button
                    key={idea}
                    type="button"
                    onClick={() => selectIdea(idea)}
                    aria-pressed={selectedIdea === idea}
                    data-state={selectedIdea === idea ? "active" : "inactive"}
                    className={clsx(
                      "inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition duration-150",
                      getSelectableChipClasses(selectedIdea === idea, "orange")
                    )}
                  >
                    <span
                      className={clsx(
                        "inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-bold",
                        getSelectableChipIconClasses(selectedIdea === idea)
                      )}
                    >
                      ✓
                    </span>
                    <span>{idea}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3 rounded-[28px] border border-slate-200 bg-slate-50 p-4">
                <div>
                  <div className="text-sm font-medium text-slate-800">Estilo</div>
                  <div className="text-xs text-slate-500">No lo dejes ambiguo si quieres consistencia.</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(["auto", "product", "cartoon", "cinematic", "ui-concept", "minimal"] as const).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => selectStyle(preset)}
                      aria-pressed={style === preset}
                      data-state={style === preset ? "active" : "inactive"}
                      className={clsx(
                        "inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition duration-150",
                        getSelectableChipClasses(style === preset)
                      )}
                    >
                      <span
                        className={clsx(
                          "inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-bold",
                          getSelectableChipIconClasses(style === preset)
                        )}
                      >
                        ✓
                      </span>
                      <span>{preset}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs leading-5 text-slate-500">{style ? styleDescriptions[style] : "Sin estilo fijo. Si eliges uno, aquí verás su descripción."}</p>
              </div>

              <div className="space-y-3 rounded-[28px] border border-slate-200 bg-slate-50 p-4">
                <div>
                  <div className="text-sm font-medium text-slate-800">Formato</div>
                  <div className="text-xs text-slate-500">Cámbialo antes de generar, no después.</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(["1:1", "4:3", "3:4", "16:9", "9:16"] as const).map((ratio) => (
                    <button
                      key={ratio}
                      type="button"
                      onClick={() => selectAspectRatio(ratio)}
                      aria-pressed={aspectRatio === ratio}
                      data-state={aspectRatio === ratio ? "active" : "inactive"}
                      className={clsx(
                        "inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition duration-150",
                        getSelectableChipClasses(aspectRatio === ratio, "orange")
                      )}
                    >
                      <span
                        className={clsx(
                          "inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-bold",
                          getSelectableChipIconClasses(aspectRatio === ratio)
                        )}
                      >
                        ✓
                      </span>
                      <span>{ratio}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs leading-5 text-slate-500">Para piezas tipo hero usa 16:9. Para assets o iconos, 1:1.</p>
              </div>
            </div>

            <div className="space-y-3 rounded-[28px] border border-dashed border-slate-300 bg-white p-4">
              <div className="text-sm font-medium text-slate-800">Pulir prompt</div>
              <div className="flex flex-wrap gap-2">
                {quickTweaks.map((tweak) => (
                  <button
                    key={tweak}
                    type="button"
                    onClick={() => toggleTweak(tweak)}
                    aria-pressed={selectedTweaks.includes(tweak)}
                    data-state={selectedTweaks.includes(tweak) ? "active" : "inactive"}
                    className={clsx(
                      "inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition duration-150",
                      getSelectableChipClasses(selectedTweaks.includes(tweak))
                    )}
                  >
                    <span
                      className={clsx(
                        "inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-bold",
                        selectedTweaks.includes(tweak)
                          ? "border-white/70 bg-white/15 text-white"
                          : "border-slate-300 bg-white text-slate-400"
                      )}
                    >
                      {selectedTweaks.includes(tweak) ? "✓" : "+"}
                    </span>
                    <span>{tweak}</span>
                  </button>
                ))}
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-600">
                <span className="font-medium text-slate-800">Prompt enriquecido:</span> {enhancedPrompt || "Todavía vacío"}
              </div>
            </div>

            {mode === "image-to-image" && (
              <div className="space-y-3 rounded-[28px] border border-slate-200 bg-slate-50 p-4">
                <div>
                  <div className="text-sm font-medium text-slate-800">Imagen de referencia</div>
                  <div className="text-xs text-slate-500">Útil para variaciones, remix y dirección visual más controlada.</div>
                </div>
                <div
                  {...getRootProps()}
                  className={clsx(
                    "flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-[24px] border border-dashed px-6 py-8 text-center transition",
                    isDragActive ? "border-orange-400 bg-orange-50" : "border-slate-300 bg-white hover:border-slate-400"
                  )}
                >
                  <input {...getInputProps()} />
                  <Upload className="mb-3 h-8 w-8 text-slate-500" />
                  <p className="text-sm font-medium text-slate-700">Arrastra una imagen o haz click para subirla</p>
                  <p className="mt-1 text-xs text-slate-500">PNG, JPG, WEBP · una imagen</p>
                </div>

                {referencePreview && <img src={referencePreview} alt="Vista previa" className="h-64 w-full rounded-[24px] object-cover" />}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!canSubmit || loading}
                className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
                {loading ? "Generando…" : "Generar imagen"}
              </button>

              <button
                type="button"
                onClick={resetEditor}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                <RefreshCcw className="h-4 w-4" />
                Limpiar
              </button>

              <button
                type="button"
                onClick={clearSavedState}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                <Trash2 className="h-4 w-4" />
                Borrar memoria local
              </button>
            </div>

            {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
            {notice && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}
          </div>

          <aside className="space-y-6">
            <div className="rounded-[32px] border border-slate-200 bg-slate-950 p-5 text-white shadow-[0_16px_48px_rgba(15,23,42,0.12)] md:p-7">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-medium text-orange-300">
                  <ImagePlus className="h-4 w-4" />
                  Resultado principal
                </div>
                {result?.imageUrl && (
                  <div className="flex flex-wrap gap-2">
                    <a href={result.imageUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-medium text-white hover:bg-white/15">
                      <Download className="h-3.5 w-3.5" />
                      Abrir
                    </a>
                    <button type="button" onClick={downloadResult} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-medium text-white hover:bg-white/15">
                      <Download className="h-3.5 w-3.5" />
                      Descargar
                    </button>
                  </div>
                )}
              </div>

              <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/5">
                {result ? (
                  <img src={result.imageUrl} alt="Resultado generado" className="aspect-square w-full object-cover" />
                ) : (
                  <div className="flex aspect-square items-center justify-center p-8 text-center text-sm leading-6 text-slate-400">
                    Aquí debe vivir la imagen principal. El problema de muchas demos es que la generación queda aislada; esta vista ya prepara descarga, reuso e historial.
                  </div>
                )}
              </div>

              {result && (
                <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-xs text-slate-300">
                  <div className="flex items-center justify-between gap-2">
                    <span>Provider: {result.provider}</span>
                    <span>{result.model}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={copyPromptUsed} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 font-medium text-white hover:bg-white/15">
                      <Copy className="h-3.5 w-3.5" />
                      Copiar prompt
                    </button>
                    <button type="button" onClick={loadResultAsReference} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 font-medium text-white hover:bg-white/15">
                      <Upload className="h-3.5 w-3.5" />
                      Usar como referencia
                    </button>
                    <button type="button" onClick={createVariation} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 font-medium text-white hover:bg-white/15">
                      <WandSparkles className="h-3.5 w-3.5" />
                      Variar
                    </button>
                  </div>
                  {result.promptUsed && <div className="rounded-xl bg-black/20 px-3 py-2 leading-5 text-slate-300">{result.promptUsed}</div>}
                </div>
              )}
            </div>

            <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-[0_16px_48px_rgba(15,23,42,0.06)] md:p-7">
              <div className="mb-4 flex items-center justify-between gap-3 text-sm font-medium text-slate-800">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4" />
                  Historial reciente
                </div>
                {history.length > 0 && (
                  <button type="button" onClick={clearHistory} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50">
                    <Trash2 className="h-3.5 w-3.5" />
                    Limpiar historial
                  </button>
                )}
              </div>
              {history.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 px-4 py-6 text-sm leading-6 text-slate-500">
                  Todavía no hay historial. En cuanto generes, aquí tendrás reutilización real del flujo, no solo una imagen perdida.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {history.map((item) => (
                    <button key={item.id} type="button" onClick={() => applyHistoryItem(item)} className="overflow-hidden rounded-[24px] border border-slate-200 text-left transition hover:border-slate-300 hover:shadow-sm">
                      <img src={item.imageUrl} alt={item.prompt} className="aspect-square w-full object-cover" />
                      <div className="space-y-1 p-3">
                        <div className="line-clamp-2 text-xs font-medium leading-5 text-slate-700">{item.prompt}</div>
                        <div className="text-[11px] text-slate-400">{item.style} · {item.aspectRatio}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
