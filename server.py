import base64
import io
import os
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image
import requests


# ---------------------------------------------------------
# APP
# ---------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(
    title="Scan of Your Drawing"
)


# ---------------------------------------------------------
# CLOUDFLARE
# ---------------------------------------------------------

CLOUDFLARE_ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID")
CLOUDFLARE_API_TOKEN = os.getenv("CLOUDFLARE_API_TOKEN")

CLOUDFLARE_MODEL = "@cf/black-forest-labs/flux-2-klein-4b"

CLOUDFLARE_URL = (
    f"https://api.cloudflare.com/client/v4/accounts/"
    f"{CLOUDFLARE_ACCOUNT_ID}/ai/run/{CLOUDFLARE_MODEL}"
)


# ---------------------------------------------------------
# STATIC FILES
# ---------------------------------------------------------

@app.get("/")
async def index():
    return FileResponse(
        BASE_DIR / "index.html"
    )


@app.get("/style.css")
async def stylesheet():
    return FileResponse(
        BASE_DIR / "style.css",
        media_type="text/css"
    )


@app.get("/app.js")
async def javascript():
    return FileResponse(
        BASE_DIR / "app.js",
        media_type="application/javascript"
    )


# ---------------------------------------------------------
# HEALTH CHECK
# ---------------------------------------------------------

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "cloudflare_configured": bool(
            CLOUDFLARE_ACCOUNT_ID
            and CLOUDFLARE_API_TOKEN
        ),
        "model": CLOUDFLARE_MODEL,
    }


# ---------------------------------------------------------
# IMAGE PREPARATION
# ---------------------------------------------------------

def prepare_image(image_bytes: bytes):
    """
    Convert the uploaded image to PNG and resize it so that
    both dimensions are below 512px, as required by the
    Cloudflare FLUX.2 Klein reference-image API.
    """

    try:
        image = Image.open(
            io.BytesIO(image_bytes)
        )

        image.load()

    except Exception as exc:
        raise ValueError(
            f"Could not read the uploaded image: {exc}"
        )

    # Keep transparency if the original drawing has it.
    if image.mode not in ("RGB", "RGBA"):
        if "A" in image.getbands():
            image = image.convert("RGBA")
        else:
            image = image.convert("RGB")

    max_dimension = 511

    width, height = image.size

    if width > max_dimension or height > max_dimension:

        scale = min(
            max_dimension / width,
            max_dimension / height,
        )

        new_width = max(
            1,
            int(width * scale)
        )

        new_height = max(
            1,
            int(height * scale)
        )

        image = image.resize(
            (new_width, new_height),
            Image.Resampling.LANCZOS,
        )

    output = io.BytesIO()

    image.save(
        output,
        format="PNG",
        optimize=True,
    )

    output.seek(0)

    return output.read(), image.size


# ---------------------------------------------------------
# CLOUDFLARE IMAGE TRANSFORMATION
# ---------------------------------------------------------

def transform_with_cloudflare(
    image_bytes: bytes,
    action: str,
):
    """
    Send the original drawing and the user's natural-language
    instruction to Cloudflare FLUX.2 Klein 4B.
    """

    if not CLOUDFLARE_ACCOUNT_ID:
        raise RuntimeError(
            "CLOUDFLARE_ACCOUNT_ID is not configured."
        )

    if not CLOUDFLARE_API_TOKEN:
        raise RuntimeError(
            "CLOUDFLARE_API_TOKEN is not configured."
        )

    prepared_image, image_size = prepare_image(
        image_bytes
    )

    # This prompt is intentionally strict.
    #
    # The goal is NOT to generate a completely new image.
    # The goal is to modify the user's drawing.
    prompt = f"""
Edit the provided drawing.

The user's instruction is:

"{action}"

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
"""

    headers = {
        "Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}",
    }

    files = {
        "input_image_0": (
            "drawing.png",
            prepared_image,
            "image/png",
        ),

        "prompt": (
            None,
            prompt,
        ),

        "width": (
            None,
            str(image_size[0]),
        ),

        "height": (
            None,
            str(image_size[1]),
        ),
    }

    try:
        response = requests.post(
            CLOUDFLARE_URL,
            headers=headers,
            files=files,
            timeout=180,
        )

    except requests.RequestException as exc:
        raise RuntimeError(
            f"Could not connect to Cloudflare: {exc}"
        )

    # -----------------------------------------------------
    # CLOUDFLARE ERROR
    # -----------------------------------------------------

    if response.status_code != 200:

        try:
            error_data = response.json()

            error_message = (
                error_data
                .get("errors", [{}])[0]
                .get("message")
            )

        except Exception:
            error_message = None

        if not error_message:
            error_message = response.text[:1000]

        raise RuntimeError(
            f"Cloudflare returned HTTP "
            f"{response.status_code}: {error_message}"
        )

    # -----------------------------------------------------
    # READ RESULT
    # -----------------------------------------------------

    content_type = (
        response.headers
        .get("content-type", "")
        .lower()
    )

    # Some image endpoints can return raw image bytes.
    if content_type.startswith("image/"):

        result_bytes = response.content

        if not result_bytes:
            raise RuntimeError(
                "Cloudflare returned an empty image."
            )

        return result_bytes

    # Otherwise Cloudflare returns JSON containing Base64.
    try:
        data = response.json()

    except Exception as exc:
        raise RuntimeError(
            "Cloudflare returned an unexpected response."
        ) from exc

    result = data.get("result")

    if not result:
        raise RuntimeError(
            "Cloudflare returned no result."
        )

    image_base64 = result.get("image")

    if not image_base64:
        raise RuntimeError(
            "Cloudflare returned no generated image."
        )

    try:
        result_bytes = base64.b64decode(
            image_base64
        )

    except Exception as exc:
        raise RuntimeError(
            "Cloudflare returned invalid image data."
        ) from exc

    if not result_bytes:
        raise RuntimeError(
            "Cloudflare returned an empty image."
        )

    return result_bytes


# ---------------------------------------------------------
# TRANSFORM ENDPOINT
# ---------------------------------------------------------

@app.post("/transform")
async def transform(
    file: UploadFile = File(...),
    action: str = Form(...),
):

    # -----------------------------------------------------
    # CONFIG CHECK
    # -----------------------------------------------------

    if not CLOUDFLARE_ACCOUNT_ID:
        raise HTTPException(
            status_code=500,
            detail=(
                "CLOUDFLARE_ACCOUNT_ID is not configured."
            ),
        )

    if not CLOUDFLARE_API_TOKEN:
        raise HTTPException(
            status_code=500,
            detail=(
                "CLOUDFLARE_API_TOKEN is not configured."
            ),
        )

    # -----------------------------------------------------
    # ACTION CHECK
    # -----------------------------------------------------

    action = action.strip()

    if not action:
        raise HTTPException(
            status_code=400,
            detail=(
                "Tell the drawing what should happen."
            ),
        )

    # -----------------------------------------------------
    # IMAGE TYPE CHECK
    # -----------------------------------------------------

    allowed_types = {
        "image/png",
        "image/jpeg",
        "image/webp",
    }

    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=(
                "Please upload a PNG, JPG or WebP image."
            ),
        )

    # -----------------------------------------------------
    # READ UPLOAD
    # -----------------------------------------------------

    try:
        image_bytes = await file.read()

    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Could not read uploaded image: {exc}"
            ),
        )

    if not image_bytes:
        raise HTTPException(
            status_code=400,
            detail="The uploaded image is empty.",
        )

    # -----------------------------------------------------
    # TRANSFORM
    # -----------------------------------------------------

    try:

        result_bytes = transform_with_cloudflare(
            image_bytes=image_bytes,
            action=action,
        )

    except RuntimeError as exc:

        print(
            "CLOUDFLARE TRANSFORM ERROR:",
            repr(exc),
        )

        raise HTTPException(
            status_code=502,
            detail=str(exc),
        )

    except ValueError as exc:

        print(
            "IMAGE PREPARATION ERROR:",
            repr(exc),
        )

        raise HTTPException(
            status_code=400,
            detail=str(exc),
        )

    except Exception as exc:

        print(
            "UNEXPECTED TRANSFORM ERROR:",
            repr(exc),
        )

        raise HTTPException(
            status_code=502,
            detail=(
                f"Image transformation failed: {exc}"
            ),
        )

    # -----------------------------------------------------
    # RETURN IMAGE TO FRONTEND
    # -----------------------------------------------------

    encoded_image = base64.b64encode(
        result_bytes
    ).decode("utf-8")

    return {
        "success": True,
        "image": encoded_image,
        "mime_type": "image/png",
        "action": action,
    }