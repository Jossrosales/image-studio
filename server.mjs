import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const upload = multer();
const port = Number(process.env.PORT || 3000);

const formSchema = z.object({
  prompt: z.string().min(6, 'El prompt es demasiado corto.'),
  mode: z.enum(['text-to-image', 'image-to-image']),
  style: z.enum(['auto', 'product', 'cartoon', 'cinematic', 'ui-concept', 'minimal']).default('auto'),
  aspectRatio: z.enum(['1:1', '4:3', '3:4', '16:9', '9:16']).default('1:1'),
});

function jsonError(res, message, status = 400) {
  return res.status(status).json({ error: message });
}

function fileToDataUrl(file) {
  return `data:${file.mimetype || 'application/octet-stream'};base64,${file.buffer.toString('base64')}`;
}

function getSize(aspectRatio) {
  switch (aspectRatio) {
    case '4:3':
      return '1024x768';
    case '3:4':
      return '768x1024';
    case '16:9':
      return '1536x1024';
    case '9:16':
      return '1024x1536';
    case '1:1':
    default:
      return '1024x1024';
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

app.post('/api/generate', upload.single('reference'), async (req, res) => {
  const parsed = formSchema.safeParse({
    prompt: req.body.prompt,
    mode: req.body.mode,
    style: req.body.style ?? 'auto',
    aspectRatio: req.body.aspectRatio ?? '1:1',
  });

  if (!parsed.success) {
    return jsonError(res, parsed.error.issues[0]?.message ?? 'Payload inválido.');
  }

  const falKey = process.env.FAL_KEY || process.env.FAL_API_KEY;
  if (!falKey) {
    return jsonError(res, 'Falta FAL_KEY en el entorno del proyecto.', 500);
  }

  const hasReference = Boolean(req.file?.buffer?.length);
  if (parsed.data.mode === 'image-to-image' && !hasReference) {
    return jsonError(res, 'Necesitas una imagen de referencia para este modo.');
  }

  const endpoint = parsed.data.mode === 'image-to-image'
    ? 'https://fal.run/fal-ai/flux/dev/image-to-image'
    : 'https://fal.run/fal-ai/flux/dev';

  const payload = {
    prompt: enhancePrompt(parsed.data.prompt, parsed.data.style),
    image_size: getSize(parsed.data.aspectRatio),
    ...(hasReference ? { image_url: fileToDataUrl(req.file), strength: 0.82 } : {}),
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Key ${falKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const raw = await response.text();
    let data = null;

    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }

    if (!response.ok) {
      const message = typeof data === 'object' && data && 'detail' in data && typeof data.detail === 'string'
        ? data.detail
        : 'Fallo al generar la imagen con fal.';
      return jsonError(res, message, response.status);
    }

    const imageUrl = typeof data === 'object' && data && 'images' in data && Array.isArray(data.images) && typeof data.images[0]?.url === 'string'
      ? data.images[0].url
      : null;

    if (!imageUrl) {
      return jsonError(res, 'fal respondió, pero no entregó una imagen usable.', 502);
    }

    return res.json({
      imageUrl,
      provider: 'fal',
      model: parsed.data.mode === 'image-to-image' ? 'fal-ai/flux/dev/image-to-image' : 'fal-ai/flux/dev',
      promptUsed: payload.prompt,
    });
  } catch {
    return jsonError(res, 'No pude conectar con fal.', 502);
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
