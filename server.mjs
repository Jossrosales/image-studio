import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const upload = multer();
const port = Number(process.env.PORT || 3000);
const dataDir = path.join(__dirname, 'data');
const designResultsPath = path.join(dataDir, 'design-results.json');

const modelSchema = z.enum(['flux', 'turbo']);
const designResultEntrySchema = z.object({
  id: z.string(),
  person: z.string(),
  month: z.string(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  completedDate: z.string().nullable(),
  storyPoints: z.number(),
  completedTasks: z.number(),
  lateTasks: z.number(),
  tags: z.array(z.string()),
  sourceRow: z.number(),
});
const designResultsUploadSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  uploadedAt: z.string(),
  mode: z.enum(['replace', 'merge']),
  entryCount: z.number(),
  entries: z.array(designResultEntrySchema),
});
const designResultsStoreSchema = z.object({
  uploads: z.array(designResultsUploadSchema),
});
const designResultsSaveSchema = z.object({
  fileName: z.string().min(1),
  uploadedAt: z.string(),
  mode: z.enum(['replace', 'merge']),
  entries: z.array(designResultEntrySchema),
});

const formSchema = z.object({
  prompt: z.string().min(6, 'El prompt es demasiado corto.'),
  mode: z.enum(['text-to-image', 'image-to-image']),
  style: z.enum(['auto', 'product', 'cartoon', 'cinematic', 'ui-concept', 'minimal']).default('auto'),
  aspectRatio: z.enum(['1:1', '4:3', '3:4', '16:9', '9:16']).default('1:1'),
  model: modelSchema.default('flux'),
});

app.use(express.json({ limit: '10mb' }));

function jsonError(res, message, status = 400, details = undefined) {
  return res.status(status).json({ error: message, ...(details ? { details } : {}) });
}

function createId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

async function ensureDataDir() {
  await fs.mkdir(dataDir, { recursive: true });
}

function emptyDesignResultsStore() {
  return { uploads: [] };
}

async function readDesignResultsStore() {
  try {
    const raw = await fs.readFile(designResultsPath, 'utf8');
    return designResultsStoreSchema.parse(JSON.parse(raw));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return emptyDesignResultsStore();
    }
    throw error;
  }
}

async function writeDesignResultsStore(payload) {
  await ensureDataDir();
  await fs.writeFile(designResultsPath, JSON.stringify(payload, null, 2), 'utf8');
}

function flattenEntries(uploads) {
  return uploads.flatMap((uploadItem) => uploadItem.entries);
}

function getLatestUpload(uploads) {
  return uploads.length ? uploads[0] : null;
}

function toDesignResultsResponse(store) {
  const latestUpload = getLatestUpload(store.uploads);
  return {
    entries: flattenEntries(store.uploads),
    uploadedFileName: latestUpload?.fileName ?? null,
    uploadedAt: latestUpload?.uploadedAt ?? null,
    uploads: store.uploads.map((uploadItem) => ({
      id: uploadItem.id,
      fileName: uploadItem.fileName,
      uploadedAt: uploadItem.uploadedAt,
      mode: uploadItem.mode,
      entryCount: uploadItem.entryCount,
    })),
  };
}

function getSize(aspectRatio) {
  switch (aspectRatio) {
    case '4:3':
      return { width: 1024, height: 768 };
    case '3:4':
      return { width: 768, height: 1024 };
    case '16:9':
      return { width: 1536, height: 1024 };
    case '9:16':
      return { width: 1024, height: 1536 };
    case '1:1':
    default:
      return { width: 1024, height: 1024 };
  }
}

function enhancePrompt(prompt, style) {
  const additions = {
    auto: '',
    product: 'clean product render, premium studio lighting, polished composition, realistic material control',
    cartoon: 'cute cartoon-style 3D render, rounded forms, playful proportions, glossy finish',
    cinematic: 'cinematic lighting, stronger contrast, premium dramatic composition, hero framing',
    'ui-concept': 'polished interface concept, product design presentation, modern brand-friendly visual language',
    minimal: 'minimal composition, clean negative space, reduced visual noise, focused subject',
  };

  return [prompt.trim(), additions[style]].filter(Boolean).join(', ');
}

app.get('/api/design-results', async (_req, res) => {
  try {
    const store = await readDesignResultsStore();
    return res.json(toDesignResultsResponse(store));
  } catch (error) {
    return jsonError(res, error instanceof Error ? error.message : 'No pude leer el historial de resultados.', 500);
  }
});

app.post('/api/design-results', async (req, res) => {
  const parsed = designResultsSaveSchema.safeParse(req.body);
  if (!parsed.success) {
    return jsonError(res, parsed.error.issues[0]?.message ?? 'Payload inválido.');
  }

  try {
    const store = await readDesignResultsStore();
    const newUpload = {
      id: createId('upload'),
      fileName: parsed.data.fileName,
      uploadedAt: parsed.data.uploadedAt,
      mode: parsed.data.mode,
      entryCount: parsed.data.entries.length,
      entries: parsed.data.entries,
    };

    const uploads = parsed.data.mode === 'replace'
      ? [newUpload]
      : [newUpload, ...store.uploads];

    const nextStore = { uploads };
    await writeDesignResultsStore(nextStore);
    return res.json({ ok: true, savedEntries: parsed.data.entries.length, uploads: uploads.length });
  } catch (error) {
    return jsonError(res, error instanceof Error ? error.message : 'No pude guardar el historial de resultados.', 500);
  }
});

app.delete('/api/design-results', async (_req, res) => {
  try {
    await writeDesignResultsStore(emptyDesignResultsStore());
    return res.json({ ok: true });
  } catch (error) {
    return jsonError(res, error instanceof Error ? error.message : 'No pude limpiar el historial de resultados.', 500);
  }
});

app.post('/api/generate', upload.single('reference'), async (req, res) => {
  const parsed = formSchema.safeParse({
    prompt: req.body.prompt,
    mode: req.body.mode,
    style: req.body.style ?? 'auto',
    aspectRatio: req.body.aspectRatio ?? '1:1',
    model: req.body.model ?? 'flux',
  });

  if (!parsed.success) {
    return jsonError(res, parsed.error.issues[0]?.message ?? 'Payload inválido.');
  }

  if (parsed.data.mode === 'image-to-image') {
    return jsonError(res, 'Pollinations en esta integración quedó configurado solo para text-to-image. Si quieres, te agrego otra opción gratis para image-to-image.', 400);
  }

  const promptUsed = enhancePrompt(parsed.data.prompt, parsed.data.style);
  const { width, height } = getSize(parsed.data.aspectRatio);
  const seed = Math.floor(Math.random() * 1000000000);

  try {
    const params = new URLSearchParams({
      model: parsed.data.model,
      width: String(width),
      height: String(height),
      seed: String(seed),
      nologo: 'true',
      private: 'true',
      enhance: 'true',
      safe: 'true',
    });

    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(promptUsed)}?${params.toString()}`;

    const response = await fetch(imageUrl, { redirect: 'follow' });
    if (!response.ok) {
      return jsonError(res, 'Pollinations no pudo generar la imagen en este momento.', 502, { status: response.status });
    }

    return res.json({
      imageUrl,
      provider: 'pollinations',
      model: `pollinations/${parsed.data.model}`,
      promptUsed,
    });
  } catch (error) {
    return jsonError(res, error instanceof Error ? error.message : 'No pude generar la imagen con Pollinations.', 502);
  }
});

const distDir = path.join(__dirname, 'dist', 'image-studio', 'browser');
app.use(express.static(distDir));
app.get('/{*any}', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`Image Studio running on http://localhost:${port}`);
});
