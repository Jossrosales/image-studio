import { z } from "zod";

const formSchema = z.object({
  prompt: z.string().min(6, "El prompt es demasiado corto."),
  mode: z.enum(["text-to-image", "image-to-image"]),
  style: z.enum(["auto", "product", "cartoon", "cinematic", "ui-concept", "minimal"]).default("auto"),
  aspectRatio: z.enum(["1:1", "4:3", "3:4", "16:9", "9:16"]).default("1:1"),
});

function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

async function fileToDataUrl(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  return `data:${file.type || "application/octet-stream"};base64,${buffer.toString("base64")}`;
}

function getSize(aspectRatio: "1:1" | "4:3" | "3:4" | "16:9" | "9:16") {
  switch (aspectRatio) {
    case "4:3":
      return "1024x768";
    case "3:4":
      return "768x1024";
    case "16:9":
      return "1536x1024";
    case "9:16":
      return "1024x1536";
    case "1:1":
    default:
      return "1024x1024";
  }
}

function enhancePrompt(prompt: string, style: "auto" | "product" | "cartoon" | "cinematic" | "ui-concept" | "minimal") {
  const additions: Record<typeof style, string> = {
    auto: "",
    product: "clean product render, premium studio lighting, polished composition, realistic material control",
    cartoon: "cute cartoon-style 3D render, rounded forms, playful proportions, glossy finish",
    cinematic: "cinematic lighting, stronger contrast, premium dramatic composition, hero framing",
    "ui-concept": "polished interface concept, product design presentation, modern brand-friendly visual language",
    minimal: "minimal composition, clean negative space, reduced visual noise, focused subject",
  };

  return [prompt.trim(), additions[style]].filter(Boolean).join(", ");
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const parsed = formSchema.safeParse({
    prompt: formData.get("prompt"),
    mode: formData.get("mode"),
    style: formData.get("style") ?? "auto",
    aspectRatio: formData.get("aspectRatio") ?? "1:1",
  });

  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Payload inválido.");
  }

  const falKey = process.env.FAL_KEY || process.env.FAL_API_KEY;
  if (!falKey) {
    return jsonError("Falta FAL_KEY en el entorno del proyecto.", 500);
  }

  const reference = formData.get("reference");
  const hasReference = reference instanceof File && reference.size > 0;

  if (parsed.data.mode === "image-to-image" && !hasReference) {
    return jsonError("Necesitas una imagen de referencia para este modo.");
  }

  const endpoint =
    parsed.data.mode === "image-to-image"
      ? "https://fal.run/fal-ai/flux/dev/image-to-image"
      : "https://fal.run/fal-ai/flux/dev";

  const promptUsed = enhancePrompt(parsed.data.prompt, parsed.data.style);

  const payload: Record<string, unknown> = {
    prompt: promptUsed,
    image_size: getSize(parsed.data.aspectRatio),
  };

  if (hasReference && reference instanceof File) {
    payload.image_url = await fileToDataUrl(reference);
    payload.strength = 0.82;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Key ${falKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const raw = await response.text();
  let data: unknown = null;

  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }

  if (!response.ok) {
    const message =
      typeof data === "object" && data && "detail" in data && typeof data.detail === "string"
        ? data.detail
        : "Fallo al generar la imagen con fal.";
    return jsonError(message, response.status);
  }

  const imageUrl =
    typeof data === "object" &&
    data &&
    "images" in data &&
    Array.isArray(data.images) &&
    typeof data.images[0]?.url === "string"
      ? data.images[0].url
      : null;

  if (!imageUrl) {
    return jsonError("fal respondió, pero no entregó una imagen usable.", 502);
  }

  return Response.json({
    imageUrl,
    provider: "fal",
    model: parsed.data.mode === "image-to-image" ? "fal-ai/flux/dev/image-to-image" : "fal-ai/flux/dev",
    promptUsed,
  });
}
