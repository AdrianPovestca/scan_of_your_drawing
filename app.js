console.log("app.js loaded");

const fileInput = document.getElementById("fileInput");
const uploadPanel = document.getElementById("uploadPanel");
const previewPanel = document.getElementById("previewPanel");
const previewImage = document.getElementById("previewImage");
const actionInput = document.getElementById("actionInput");
const bringToLife = document.getElementById("bringToLife");
const statusEl = document.getElementById("status");

let selectedFile = null;
let dataCanvas = null;
let dataContext = null;
let animationFrame = null;
let idleFrame = null;
let particles = [];

function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
}

/* Any error now shows up on the page, not only in the console */
window.addEventListener("error", (e) => setStatus("Error: " + e.message));
window.addEventListener("unhandledrejection", (e) =>
    setStatus("Error: " + ((e.reason && e.reason.message) || e.reason))
);


/* =========================================================
   IMAGE LOADING
========================================================= */

function loadImage(file) {
    if (!file) {
        setStatus("Please choose an image.");
        return;
    }

    if (!file.type.startsWith("image/")) {
        setStatus("Please upload an image file.");
        return;
    }

    selectedFile = file;

    const reader = new FileReader();

    reader.onload = () => {
        previewImage.onload = () => {
            if (dataCanvas) {
                dataCanvas.remove();
                dataCanvas = null;
                dataContext = null;
            }
            previewImage.style.transition = "none";
            previewImage.style.opacity = "1";
            uploadPanel.classList.add("hidden");
            previewPanel.classList.remove("hidden");
            setStatus("");
        };

        previewImage.onerror = () => {
            setStatus("This image format cannot be previewed.");
        };

        previewImage.src = reader.result;
    };

    reader.onerror = () => {
        setStatus("Something went wrong while reading the image.");
    };

    reader.readAsDataURL(file);
}

fileInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    console.log("file chosen:", file && file.name, file && file.type);

    if (file) {
        loadImage(file);
    }

    /* allows choosing the same file again */
    fileInput.value = "";
});


/* =========================================================
   CREATE THE DATA LAYER
========================================================= */

function createDataCanvas() {
    const wrapper = previewImage.parentElement;

    if (!wrapper) {
        throw new Error("Image wrapper not found.");
    }

    wrapper.style.position = "relative";

    if (dataCanvas) {
        dataCanvas.remove();
    }

    dataCanvas = document.createElement("canvas");

    dataCanvas.style.position = "absolute";
    dataCanvas.style.inset = "0";
    dataCanvas.style.width = "100%";
    dataCanvas.style.height = "100%";
    dataCanvas.style.pointerEvents = "none";
    dataCanvas.style.zIndex = "5";

    wrapper.appendChild(dataCanvas);

    dataCanvas.width = previewImage.naturalWidth;
    dataCanvas.height = previewImage.naturalHeight;

    dataContext = dataCanvas.getContext("2d");

    return dataCanvas;
}


/* =========================================================
   READ REAL PIXELS FROM THE DRAWING
========================================================= */

function extractDrawingParticles() {
    const sourceCanvas = document.createElement("canvas");
    const sourceContext = sourceCanvas.getContext("2d", {
        willReadFrequently: true
    });

    const maxDimension = 700;

    let width = previewImage.naturalWidth;
    let height = previewImage.naturalHeight;

    if (!width || !height) {
        throw new Error("Could not read the drawing.");
    }

    const scale = Math.min(1, maxDimension / Math.max(width, height));

    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));

    sourceCanvas.width = width;
    sourceCanvas.height = height;

    sourceContext.clearRect(0, 0, width, height);
    sourceContext.drawImage(previewImage, 0, 0, width, height);

    const pixels = sourceContext.getImageData(0, 0, width, height).data;

    const characters = [
        "0", "1", "2", "3", "4", "5", "6", "7", "8", "9",
        "+", "-", "=", "*", "/", "#", "%", "&", "@", "$",
        "<", ">", "[", "]", "{", "}", "(", ")", "^", "~"
    ];

    const result = [];

    const step = Math.max(4, Math.round(Math.max(width, height) / 135));

    for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {

            const index = (y * width + x) * 4;

            const r = pixels[index];
            const g = pixels[index + 1];
            const b = pixels[index + 2];
            const a = pixels[index + 3];

            if (a < 40) continue;

            const brightness = (r + g + b) / 3;
            const saturation = Math.max(r, g, b) - Math.min(r, g, b);

            if (!(brightness < 220 || saturation > 22)) continue;

            const character = characters[
                (r * 3 + g * 5 + b * 7 + x * 11 + y * 13) % characters.length
            ];

            const darkness = 1 - brightness / 255;
            const jitter = step * 0.18;

            result.push({
                originalX: x,
                originalY: y,
                character,
                darkness,
                jitterX: Math.sin(x * 0.17 + y * 0.07) * jitter,
                jitterY: Math.cos(x * 0.11 + y * 0.13) * jitter,
                phase: (x * 0.031 + y * 0.047) % (Math.PI * 2)
            });
        }
    }

    return { particles: result, width, height };
}

function prepareParticles() {
    const extracted = extractDrawingParticles();

    particles = extracted.particles;

    const scaleX = dataCanvas.width / extracted.width;
    const scaleY = dataCanvas.height / extracted.height;

    for (const p of particles) {
        p.originalX = p.originalX * scaleX + p.jitterX * scaleX;
        p.originalY = p.originalY * scaleY + p.jitterY * scaleY;
    }

    return particles.length > 0;
}


/* =========================================================
   DATA FIELD POSITIONS
========================================================= */

function fieldBase(p, i, width, height) {
    const h1 = Math.abs(Math.sin(p.originalX * 12.9898 + p.originalY * 78.233 + i * 37.719));
    const h2 = Math.abs(Math.cos(p.originalX * 4.123 + p.originalY * 17.271 + i * 11.193));

    return {
        x: width * (0.12 + h1 * 0.76),
        y: height * (0.12 + h2 * 0.76)
    };
}

/* where a particle rests at the end of the scan animation */
function fieldPosition(p, i, width, height) {
    const f = fieldBase(p, i, width, height);

    return {
        x: f.x + (width / 2 - f.x) * 0.32,
        y: f.y + (height / 2 - f.y) * 0.32
    };
}


/* =========================================================
   DRAW THE DATA (scan animation)
========================================================= */

function drawData(progress) {
    if (!dataContext || !dataCanvas) return;

    const ctx = dataContext;
    const width = dataCanvas.width;
    const height = dataCanvas.height;

    ctx.clearRect(0, 0, width, height);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const put = (ch, x, y, size, fill) => {
        ctx.font = `${size}px monospace`;
        ctx.fillStyle = fill;
        ctx.fillText(ch, x, y);
    };

    /* PHASE 1 (0 -> 0.22): characters appear on the drawing */
    if (progress < 0.22) {
        const p = progress / 0.22;
        const eased = p * p * (3 - 2 * p);

        for (const q of particles) {
            const alpha = eased * (0.45 + q.darkness * 0.55);
            put(q.character, q.originalX, q.originalY,
                8 + q.darkness * 5, `rgba(40,40,40,${alpha})`);
        }

        previewImage.style.opacity = String(1 - eased * 0.55);
        return;
    }

    /* PHASE 2 (0.22 -> 0.55): the drawing becomes data */
    if (progress < 0.55) {
        const p = (progress - 0.22) / 0.33;
        const eased = p * p * (3 - 2 * p);

        previewImage.style.opacity = String(0.45 - eased * 0.45);

        for (const q of particles) {
            const distance = 8 + eased * (28 + q.darkness * 55);
            const wave = Math.sin(q.phase + p * Math.PI * 3);

            const x = q.originalX + Math.cos(q.phase) * distance + wave * 5;
            const y = q.originalY + Math.sin(q.phase) * distance + wave * 5;

            put(q.character, x, y, 8 + q.darkness * 5,
                `rgba(55,55,55,${0.65 + q.darkness * 0.35})`);
        }
        return;
    }

    /* PHASE 3 (0.55 -> 0.82): data reorganizes across the canvas */
    if (progress < 0.82) {
        const p = (progress - 0.55) / 0.27;
        const eased = p * p * (3 - 2 * p);

        previewImage.style.opacity = "0";

        for (let i = 0; i < particles.length; i++) {
            const q = particles[i];
            const f = fieldBase(q, i, width, height);

            const startX = q.originalX + Math.cos(q.phase) * 45;
            const startY = q.originalY + Math.sin(q.phase) * 45;

            const curve = Math.sin(p * Math.PI) * 55;

            const x = startX + (f.x - startX) * eased +
                Math.sin(q.phase + p * Math.PI * 5) * curve;
            const y = startY + (f.y - startY) * eased +
                Math.cos(q.phase + p * Math.PI * 4) * curve;

            put(q.character, x, y, 8 + q.darkness * 5, "rgba(45,45,45,0.85)");
        }
        return;
    }

    /* PHASE 4 (0.82 -> 1): data tightens */
    const p = (progress - 0.82) / 0.18;
    const eased = p * p * (3 - 2 * p);

    previewImage.style.opacity = "0";

    for (let i = 0; i < particles.length; i++) {
        const q = particles[i];
        const f = fieldBase(q, i, width, height);

        const x = f.x + (width / 2 - f.x) * eased * 0.32;
        const y = f.y + (height / 2 - f.y) * eased * 0.32;

        put(q.character, x, y, 9, `rgba(45,45,45,${0.82 - eased * 0.55})`);
    }
}

function animateData(duration = 4200) {
    return new Promise((resolve) => {
        const start = performance.now();

        function frame(now) {
            const progress = Math.min(1, (now - start) / duration);

            drawData(progress);

            if (progress < 1) {
                animationFrame = requestAnimationFrame(frame);
            } else {
                animationFrame = null;
                resolve();
            }
        }

        animationFrame = requestAnimationFrame(frame);
    });
}


/* =========================================================
   IDLE: data keeps floating while waiting for the AI
========================================================= */

function startIdle() {
    const width = dataCanvas.width;
    const height = dataCanvas.height;

    const base = particles.map((p, i) => fieldPosition(p, i, width, height));

    function frame(now) {
        if (!dataContext) return;

        const t = now / 1000;
        const ctx = dataContext;

        ctx.clearRect(0, 0, width, height);
        ctx.font = "9px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(45,45,45,0.27)";

        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];

            ctx.fillText(
                p.character,
                base[i].x + Math.sin(t * 1.3 + p.phase * 3) * 6,
                base[i].y + Math.cos(t * 1.1 + p.phase * 2) * 6
            );
        }

        idleFrame = requestAnimationFrame(frame);
    }

    idleFrame = requestAnimationFrame(frame);
}

function stopIdle() {
    if (idleFrame) {
        cancelAnimationFrame(idleFrame);
        idleFrame = null;
    }
}


/* =========================================================
   AI RESULT -> GRID OF CHARACTERS
   (the AI image is only READ, never displayed)
========================================================= */

function buildTargets(img, canvasWidth, canvasHeight) {
    /* smaller cell = denser. Try 4 for detail, 7 for lighter */
    const cell = Math.max(5, canvasWidth / 170);

    const cols = Math.floor(canvasWidth / cell);
    const rows = Math.floor(canvasHeight / cell);

    const small = document.createElement("canvas");
    small.width = cols;
    small.height = rows;

    const ctx = small.getContext("2d", { willReadFrequently: true });

    ctx.clearRect(0, 0, cols, rows);
    ctx.drawImage(img, 0, 0, cols, rows);

    const data = ctx.getImageData(0, 0, cols, rows).data;

    const DARK = "@#8&%$0W";
    const MID = "3469*+X?";
    const LIGHT = "1/7=:-<>";

    const targets = [];

    for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
            const i = (gy * cols + gx) * 4;

            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            if (a < 40) continue;

            const brightness = (r + g + b) / 3;
            const saturation = Math.max(r, g, b) - Math.min(r, g, b);

            /* skips white AND the light-grey checkerboard background.
               branches vanish -> raise 228; grey squares appear -> lower it */
            if (brightness >= 228 && saturation <= 28) continue;

            const darkness = 1 - brightness / 255;

            const set =
                darkness > 0.6 ? DARK :
                darkness > 0.35 ? MID : LIGHT;

            const pick = Math.floor(
                Math.abs(Math.sin(gx * 12.9898 + gy * 78.233)) * set.length
            ) % set.length;

            targets.push({
                x: (gx + 0.5) * cell,
                y: (gy + 0.5) * cell,
                ch: set[pick],
                style: `rgba(${r},${g},${b},${0.6 + darkness * 0.4})`
            });
        }
    }

    return { targets, size: cell * 1.3 };
}

function reconstruct(targets, size, duration = 2800) {
    return new Promise((resolve) => {
        const width = dataCanvas.width;
        const height = dataCanvas.height;
        const count = particles.length;

        const starts = particles.map((p, i) => fieldPosition(p, i, width, height));

        const spread = 0.35;

        const items = targets.map((t, i) => {
            const s = starts[i % count];

            return {
                t,
                sx: s.x,
                sy: s.y,
                phase: particles[i % count].phase,
                delay: Math.abs(Math.sin(i * 12.9898 + 4.1)) * spread
            };
        });

        const startTime = performance.now();

        function frame(now) {
            const p = Math.min(1, (now - startTime) / duration);
            const ctx = dataContext;

            ctx.clearRect(0, 0, width, height);
            ctx.font = `${size}px monospace`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            for (const it of items) {
                let q = (p - it.delay) / (1 - spread);
                q = Math.max(0, Math.min(1, q));

                const e = q * q * (3 - 2 * q);
                const curve = Math.sin(q * Math.PI) * 30;

                const x = it.sx + (it.t.x - it.sx) * e +
                    Math.sin(it.phase + q * Math.PI * 3) * curve;
                const y = it.sy + (it.t.y - it.sy) * e +
                    Math.cos(it.phase + q * Math.PI * 3) * curve;

                ctx.globalAlpha = 0.35 + 0.65 * e;
                ctx.fillStyle = it.t.style;
                ctx.fillText(it.t.ch, x, y);
            }

            ctx.globalAlpha = 1;

            if (p < 1) {
                animationFrame = requestAnimationFrame(frame);
            } else {
                animationFrame = null;
                resolve();
            }
        }

        animationFrame = requestAnimationFrame(frame);
    });
}

function loadResultImage(result) {
    return new Promise((resolve, reject) => {
        const img = new Image();

        img.onload = () => resolve(img);
        img.onerror = () =>
            reject(new Error("Could not read the transformed drawing."));

        img.src = `data:${result.mime_type};base64,${result.image}`;
    });
}


/* =========================================================
   MAIN TRANSFORMATION
========================================================= */

async function transformDrawing() {

    if (!selectedFile) {
        setStatus("Upload a drawing first.");
        return;
    }

    const action = actionInput.value.trim();

    if (!action) {
        setStatus("Tell the drawing what should happen first.");
        actionInput.focus();
        return;
    }

    const supportedTypes = ["image/png", "image/jpeg", "image/webp"];

    if (!supportedTypes.includes(selectedFile.type)) {
        setStatus("Please use a PNG, JPG or WebP image.");
        return;
    }

    bringToLife.disabled = true;
    actionInput.disabled = true;

    stopIdle();

    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }

    try {

        /* 1. Drawing -> real data */

        previewImage.style.transition = "none";
        previewImage.style.opacity = "1";

        createDataCanvas();

        if (!prepareParticles()) {
            throw new Error("Could not extract data from the drawing.");
        }

        /* 2. Ask the AI while the animation plays */

        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("action", action);

        const request = fetch("/transform", {
            method: "POST",
            body: formData
        });

        /* 3. Drawing -> data -> reorganized data */

        setStatus("Scanning your drawing...");

        await animateData(4200);

        /* 4. Data keeps living while we wait */

        setStatus("Reconstructing your drawing...");

        startIdle();

        const response = await request;
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.detail || "The transformation failed.");
        }

        if (!result.success || !result.image) {
            throw new Error("The server returned no transformed image.");
        }

        const resultImage = await loadResultImage(result);

        stopIdle();

        /* 5. Data reconstructs the drawing, made ONLY of characters */

        const { targets, size } = buildTargets(
            resultImage,
            dataCanvas.width,
            dataCanvas.height
        );

        if (targets.length === 0) {
            throw new Error("The transformed drawing had nothing to rebuild from.");
        }

        await reconstruct(targets, size);

        setStatus("Your drawing came to life.");

    } catch (error) {

        stopIdle();

        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
            animationFrame = null;
        }

        if (dataCanvas) {
            dataCanvas.remove();
            dataCanvas = null;
            dataContext = null;
        }

        previewImage.style.opacity = "1";

        console.error("Transform error:", error);

        setStatus(error.message || "Something went wrong.");

    } finally {

        bringToLife.disabled = false;
        actionInput.disabled = false;
    }
}


/* =========================================================
   EVENTS
========================================================= */

bringToLife.addEventListener("click", transformDrawing);

actionInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        transformDrawing();
    }
});