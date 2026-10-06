const MODEL = "@cf/black-forest-labs/flux-2-klein-4b";

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_ACTION_LENGTH = 200;

const BLOCKED = /\b(nude|naked|nsfw|porn\w*|sex\w*|erotic|gore|beheading|child\s*abuse|loli\w*|swastika|nazi)\b/i;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function buildPrompt(action) {
  return `
Edit the provided drawing.

The user's instruction is:

"${action}"

Treat the uploaded image as the original artwork.

IMPORTANT:
- Preserve the original main subject.
- Preserve the original composition.
- Preserve the original proportions wherever possible.
- Preserve the original linework and hand-drawn character.
- Preserve the original background.
- Keep the original subject clearly recognizable.
- Make the requested transformation directly to the existing drawing.
- Do not replace the drawing with an unrelated new image.
- Do not create a completely different scene.
- Do not remove the original subject.
- Do not add unrelated objects.
- Do not add text.
- Do not add captions.
- Do not add labels.
- Do not add logos.
- Do not add watermarks.

Interpret words such as "it", "this", "them", or "the drawing"
as referring to the main subject visible in the uploaded image.

The requested transformation must be visually obvious.

If the instruction asks to add something to the subject,
actually add that thing to the existing subject.

If the instruction asks for a physical transformation,
modify the existing subject rather than replacing it.

Return only the transformed artwork.
`;
}

function roundTo16(value, fallback) {
  const n = parseInt(value, 10);

  if (!Number.isFinite(n)) {
    return fallback;
  }

  const clamped = Math.min(1024, Math.max(256, n));

  return Math.round(clamped / 16) * 16;
}

function detectMime(base64) {
  if (base64.startsWith("/9j/")) {
    return "image/jpeg";
  }

  if (base64.startsWith("UklGR")) {
    return "image/webp";
  }

  return "image/png";
}

async function handleTransform(request, env) {
  if (request.method !== "POST") {
    return json(
      {
        detail: "Method not allowed.",
      },
      405
    );
  }

  const ip =
    request.headers.get("CF-Connecting-IP") || "unknown";

  const { success: allowed } = await env.LIMITER.limit({
    key: ip,
  });

  if (!allowed) {
    return json(
      {
        detail:
          "Too many requests. Please wait a minute and try again.",
      },
      429
    );
  }

  const declared = parseInt(
    request.headers.get("content-length") || "0",
    10
  );

  if (declared > MAX_UPLOAD_BYTES + 10_000) {
    return json(
      {
        detail: "The image is too large.",
      },
      413
    );
  }

  let incoming;

  try {
    incoming = await request.formData();
  } catch {
    return json(
      {
        detail: "Invalid request.",
      },
      400
    );
  }

  const file = incoming.get("file");
  const action = String(
    incoming.get("action") || ""
  ).trim();

  if (!file || typeof file === "string") {
    return json(
      {
        detail: "No image received.",
      },
      400
    );
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return json(
      {
        detail: "Please use a PNG, JPG or WebP image.",
      },
      400
    );
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return json(
      {
        detail: "The image is too large.",
      },
      413
    );
  }

  if (!action || action.length > MAX_ACTION_LENGTH) {
    return json(
      {
        detail: `Describe what should happen (max ${MAX_ACTION_LENGTH} characters).`,
      },
      400
    );
  }

  if (BLOCKED.test(action)) {
    return json(
      {
        detail: "That instruction isn't allowed. Try something else.",
      },
      400
    );
  }

  const width = roundTo16(
    incoming.get("width"),
    1024
  );

  const height = roundTo16(
    incoming.get("height"),
    1024
  );

  try {
    const form = new FormData();

    form.append(
      "prompt",
      buildPrompt(action)
    );

    form.append(
      "input_image_0",
      file
    );

    form.append(
      "width",
      String(width)
    );

    form.append(
      "height",
      String(height)
    );

    const serialized = new Response(form);

    const result = await env.AI.run(MODEL, {
      multipart: {
        body: serialized.body,
        contentType:
          serialized.headers.get("content-type"),
      },
    });

    if (!result || !result.image) {
      return json(
        {
          detail:
            "The AI returned no image. Please try again.",
        },
        502
      );
    }

    return json({
      success: true,
      image: result.image,
      mime_type: detectMime(result.image),
    });
  } catch (error) {
    console.error(
      "Workers AI error:",
      error
    );

    return json(
      {
        detail:
          "The transformation service is busy. Please try again in a moment.",
      },
      502
    );
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/transform") {
      return handleTransform(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};