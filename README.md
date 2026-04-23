# Image Studio

Base en **Next.js** para generar imágenes por prompt o desde una referencia visual.

## Qué incluye

- Prompt → imagen
- Imagen → imagen
- UI limpia tipo herramienta creativa
- Backend preparado para **fal / FLUX**
- Librerías open source útiles ya integradas:
  - `react-dropzone`
  - `zod`
  - `lucide-react`
  - `clsx`

## Variables de entorno

Crea un archivo `.env.local`:

```env
FAL_KEY=tu_api_key_de_fal
```

## Correr el proyecto

```bash
npm install
npm run dev
```

Abre `http://localhost:3000`

## Siguientes mejoras recomendadas

- `zustand` para historial, presets y estado global
- `react-hook-form` para formularios más escalables
- `framer-motion` para feedback visual y transiciones
- `uploadthing` si quieres uploads persistentes
- `tldraw` si quieres una capa de sketch / anotación
- cola de jobs + polling si luego quieres generación async

## Nota

Ahora mismo el backend usa:
- `fal-ai/flux/dev`
- `fal-ai/flux/dev/image-to-image`

Si luego quieres algo más tipo editor creativo, conviene sumar:
- variaciones
- upscale
- historial
- favoritos
- plantillas de estilo
