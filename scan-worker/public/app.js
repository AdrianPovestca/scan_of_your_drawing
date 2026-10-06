console.log("app.js loaded");

const fileInput = document.getElementById("fileInput");
const uploadPanel = document.getElementById("uploadPanel");
const previewPanel = document.getElementById("previewPanel");
const previewImage = document.getElementById("previewImage");
const actionInput = document.getElementById("actionInput");
const bringToLife = document.getElementById("bringToLife");
const tryAgain = document.getElementById("tryAgain");
const attemptsRemainingEl = document.getElementById("attemptsRemaining");
const statusEl = document.getElementById("status");

let selectedFile = null;
let dataCanvas = null;
let dataContext = null;
let animationFrame = null;
let idleFrame = null;
let particles = [];

const MAX_ATTEMPTS = 5;
const ATTEMPTS_KEY = "scanOfYourDrawingAttempts";


/* =========================================================
   STATUS
========================================================= */

function setStatus(text) {
    if (statusEl) {
        statusEl.textContent = text;
    }
}


/* =========================================================
   ATTEMPTS
========================================================= */

function getAttemptsUsed() {
    const value = Number.parseInt(
        localStorage.getItem(ATTEMPTS_KEY) || "0",
        10
    );

    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.max(0, Math.min(MAX_ATTEMPTS, value));
}


function getAttemptsRemaining() {
    return Math.max(
        0,
        MAX_ATTEMPTS - getAttemptsUsed()
    );
}


function updateAttemptsUI() {
    const remaining = getAttemptsRemaining();

    if (attemptsRemainingEl) {
        attemptsRemainingEl.textContent =
            remaining === 1
                ? "1 transformation remaining"
                : `${remaining} transformations remaining`;
    }

    if (bringToLife) {
        bringToLife.disabled = remaining <= 0;
    }
}


function consumeAttempt() {
    const used = getAttemptsUsed();

    if (used >= MAX_ATTEMPTS) {
        return false;
    }

    localStorage.setItem(
        ATTEMPTS_KEY,
        String(used + 1)
    );

    updateAttemptsUI();

    return true;
}


/* =========================================================
   RESET TO UPLOAD
========================================================= */

function resetToUpload() {
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

    particles = [];
    selectedFile = null;

    if (previewImage) {
        previewImage.onload = null;
        previewImage.onerror = null;
        previewImage.src = "";
        previewImage.style.opacity = "1";
    }

    if (actionInput) {
        actionInput.value = "";
        actionInput.disabled = false;
    }

    if (fileInput) {
        fileInput.value = "";
    }

    if (tryAgain) {
        tryAgain.classList.add("hidden");
    }

    uploadPanel.classList.remove("hidden");
    previewPanel.classList.add("hidden");

    setStatus("");
    updateAttemptsUI();
}


/* =========================================================
   ERROR HANDLING
========================================================= */

/* Any error now shows up on the page, not only in the console */

window.addEventListener("error", (e) => {
    setStatus("Error: " + e.message);
});

window.addEventListener("unhandledrejection", (e) =>
    setStatus(
        "Error: " +
        ((e.reason && e.reason.message) || e.reason)
    )
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

    if (tryAgain) {
        tryAgain.classList.add("hidden");
    }

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

            updateAttemptsUI();
            setStatus("");
        };

        previewImage.onerror = () => {
            setStatus("This image format cannot be previewed.");
        };

        previewImage.src = reader.result;
    };

    reader.onerror = () => {
        setStatus(
            "Something went wrong while reading the image."
        );
    };

    reader.readAsDataURL(file);
}


fileInput.addEventListener("change", (event) => {
    const file = event.target.files[0];

    console.log(
        "file chosen:",
        file && file.name,
        file && file.type
    );

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

    const scale = Math.min(
        1,
        maxDimension / Math.max(width, height)
    );

    width = Math.max(
        1,
        Math.round(width * scale)
    );

    height = Math.max(
        1,
        Math.round(height * scale)
    );

    sourceCanvas.width = width;
    sourceCanvas.height = height;

    sourceContext.clearRect(
        0,
        0,
        width,
        height
    );

    sourceContext.drawImage(
        previewImage,
        0,
        0,
        width,
        height
    );

    const pixels =
        sourceContext.getImageData(
            0,
            0,
            width,
            height
        ).data;

    const characters = [
        "0", "1", "2", "3", "4",
        "5", "6", "7", "8", "9",
        "+", "-", "=", "*", "/",
        "#", "%", "&", "@", "$",
        "<", ">", "[", "]", "{",
        "}", "(", ")", "^", "~"
    ];

    const result = [];

    const step = Math.max(
        4,
        Math.round(
            Math.max(width, height) / 135
        )
    );

    for (
        let y = 0;
        y < height;
        y += step
    ) {
        for (
            let x = 0;
            x < width;
            x += step
        ) {

            const index =
                (y * width + x) * 4;

            const r = pixels[index];
            const g = pixels[index + 1];
            const b = pixels[index + 2];
            const a = pixels[index + 3];

            if (a < 40) continue;

            const brightness =
                (r + g + b) / 3;

            const saturation =
                Math.max(r, g, b) -
                Math.min(r, g, b);

            if (
                !(
                    brightness < 220 ||
                    saturation > 22
                )
            ) {
                continue;
            }

            const character =
                characters[
                    (
                        r * 3 +
                        g * 5 +
                        b * 7 +
                        x * 11 +
                        y * 13
                    ) % characters.length
                ];

            const darkness =
                1 - brightness / 255;

            const jitter =
                step * 0.18;

            result.push({
                originalX: x,
                originalY: y,
                character,
                darkness,
                jitterX:
                    Math.sin(
                        x * 0.17 +
                        y * 0.07
                    ) * jitter,
                jitterY:
                    Math.cos(
                        x * 0.11 +
                        y * 0.13
                    ) * jitter,
                phase:
                    (
                        x * 0.031 +
                        y * 0.047
                    ) % (Math.PI * 2)
            });
        }
    }

    return {
        particles: result,
        width,
        height
    };
}


function prepareParticles() {
    const extracted =
        extractDrawingParticles();

    particles =
        extracted.particles;

    const scaleX =
        dataCanvas.width /
        extracted.width;

    const scaleY =
        dataCanvas.height /
        extracted.height;

    for (const p of particles) {
        p.originalX =
            p.originalX * scaleX +
            p.jitterX * scaleX;

        p.originalY =
            p.originalY * scaleY +
            p.jitterY * scaleY;
    }

    return particles.length > 0;
}


/* =========================================================
   DATA FIELD POSITIONS
========================================================= */

function fieldBase(
    p,
    i,
    width,
    height
) {
    const h1 =
        Math.abs(
            Math.sin(
                p.originalX * 12.9898 +
                p.originalY * 78.233 +
                i * 37.719
            )
        );

    const h2 =
        Math.abs(
            Math.cos(
                p.originalX * 4.123 +
                p.originalY * 17.271 +
                i * 11.193
            )
        );

    return {
        x: width * (
            0.12 + h1 * 0.76
        ),
        y: height * (
            0.12 + h2 * 0.76
        )
    };
}


/* where a particle rests at the end of the scan animation */

function fieldPosition(
    p,
    i,
    width,
    height
) {
    const f =
        fieldBase(
            p,
            i,
            width,
            height
        );

    return {
        x:
            f.x +
            (
                width / 2 - f.x
            ) * 0.32,

        y:
            f.y +
            (
                height / 2 - f.y
            ) * 0.32
    };
}


/* =========================================================
   DRAW THE DATA
========================================================= */

function drawData(progress) {
    if (!dataContext || !dataCanvas) {
        return;
    }

    const ctx = dataContext;
    const width = dataCanvas.width;
    const height = dataCanvas.height;

    ctx.clearRect(
        0,
        0,
        width,
        height
    );

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const put = (
        ch,
        x,
        y,
        size,
        fill
    ) => {
        ctx.font =
            `${size}px monospace`;

        ctx.fillStyle = fill;

        ctx.fillText(
            ch,
            x,
            y
        );
    };


    /* PHASE 1 */

    if (progress < 0.22) {
        const p =
            progress / 0.22;

        const eased =
            p * p * (3 - 2 * p);

        for (const q of particles) {
            const alpha =
                eased *
                (
                    0.45 +
                    q.darkness * 0.55
                );

            put(
                q.character,
                q.originalX,
                q.originalY,
                8 + q.darkness * 5,
                `rgba(40,40,40,${alpha})`
            );
        }

        previewImage.style.opacity =
            String(
                1 - eased * 0.55
            );

        return;
    }


    /* PHASE 2 */

    if (progress < 0.55) {
        const p =
            (progress - 0.22) /
            0.33;

        const eased =
            p * p * (3 - 2 * p);

        previewImage.style.opacity =
            String(
                0.45 - eased * 0.45
            );

        for (const q of particles) {
            const distance =
                8 +
                eased *
                (
                    28 +
                    q.darkness * 55
                );

            const wave =
                Math.sin(
                    q.phase +
                    p * Math.PI * 3
                );

            const x =
                q.originalX +
                Math.cos(q.phase) *
                    distance +
                wave * 5;

            const y =
                q.originalY +
                Math.sin(q.phase) *
                    distance +
                wave * 5;

            put(
                q.character,
                x,
                y,
                8 + q.darkness * 5,
                `rgba(55,55,55,${
                    0.65 +
                    q.darkness * 0.35
                })`
            );
        }

        return;
    }


    /* PHASE 3 */

    if (progress < 0.82) {
        const p =
            (progress - 0.55) /
            0.27;

        const eased =
            p * p * (3 - 2 * p);

        previewImage.style.opacity = "0";

        for (
            let i = 0;
            i < particles.length;
            i++
        ) {
            const q = particles[i];

            const f =
                fieldBase(
                    q,
                    i,
                    width,
                    height
                );

            const startX =
                q.originalX +
                Math.cos(q.phase) * 45;

            const startY =
                q.originalY +
                Math.sin(q.phase) * 45;

            const curve =
                Math.sin(
                    p * Math.PI
                ) * 55;

            const x =
                startX +
                (f.x - startX) *
                    eased +
                Math.sin(
                    q.phase +
                    p * Math.PI * 5
                ) * curve;

            const y =
                startY +
                (f.y - startY) *
                    eased +
                Math.cos(
                    q.phase +
                    p * Math.PI * 4
                ) * curve;

            put(
                q.character,
                x,
                y,
                8 + q.darkness * 5,
                "rgba(45,45,45,0.85)"
            );
        }

        return;
    }


    /* PHASE 4 */

    const p =
        (progress - 0.82) /
        0.18;

    const eased =
        p * p * (3 - 2 * p);

    previewImage.style.opacity = "0";

    for (
        let i = 0;
        i < particles.length;
        i++
    ) {
        const q = particles[i];

        const f =
            fieldBase(
                q,
                i,
                width,
                height
            );

        const x =
            f.x +
            (
                width / 2 -
                f.x
            ) *
            eased *
            0.32;

        const y =
            f.y +
            (
                height / 2 -
                f.y
            ) *
            eased *
            0.32;

        put(
            q.character,
            x,
            y,
            9,
            `rgba(45,45,45,${
                0.82 -
                eased * 0.55
            })`
        );
    }
}


function animateData(duration = 4200) {
    return new Promise((resolve) => {
        const start =
            performance.now();

        function frame(now) {
            const progress =
                Math.min(
                    1,
                    (now - start) /
                    duration
                );

            drawData(progress);

            if (progress < 1) {
                animationFrame =
                    requestAnimationFrame(
                        frame
                    );
            } else {
                animationFrame = null;
                resolve();
            }
        }

        animationFrame =
            requestAnimationFrame(frame);
    });
}


/* =========================================================
   IDLE
========================================================= */

function startIdle() {
    const width =
        dataCanvas.width;

    const height =
        dataCanvas.height;

    const base =
        particles.map(
            (p, i) =>
                fieldPosition(
                    p,
                    i,
                    width,
                    height
                )
        );

    function frame(now) {
        if (!dataContext) {
            return;
        }

        const t =
            now / 1000;

        const ctx =
            dataContext;

        ctx.clearRect(
            0,
            0,
            width,
            height
        );

        ctx.font =
            "9px monospace";

        ctx.textAlign =
            "center";

        ctx.textBaseline =
            "middle";

        ctx.fillStyle =
            "rgba(45,45,45,0.27)";

        for (
            let i = 0;
            i < particles.length;
            i++
        ) {
            const p =
                particles[i];

            ctx.fillText(
                p.character,
                base[i].x +
                    Math.sin(
                        t * 1.3 +
                        p.phase * 3
                    ) * 6,

                base[i].y +
                    Math.cos(
                        t * 1.1 +
                        p.phase * 2
                    ) * 6
            );
        }

        idleFrame =
            requestAnimationFrame(
                frame
            );
    }

    idleFrame =
        requestAnimationFrame(frame);
}


function stopIdle() {
    if (idleFrame) {
        cancelAnimationFrame(
            idleFrame
        );

        idleFrame = null;
    }
}


/* =========================================================
   AI RESULT -> GRID OF CHARACTERS
========================================================= */

function buildTargets(
    img,
    canvasWidth,
    canvasHeight
) {
    const cell =
        Math.max(
            5,
            canvasWidth / 170
        );

    const cols =
        Math.floor(
            canvasWidth / cell
        );

    const rows =
        Math.floor(
            canvasHeight / cell
        );

    const small =
        document.createElement(
            "canvas"
        );

    small.width = cols;
    small.height = rows;

    const ctx =
        small.getContext(
            "2d",
            {
                willReadFrequently: true
            }
        );

    ctx.clearRect(
        0,
        0,
        cols,
        rows
    );

    ctx.drawImage(
        img,
        0,
        0,
        cols,
        rows
    );

    const data =
        ctx.getImageData(
            0,
            0,
            cols,
            rows
        ).data;

    const DARK =
        "@#8&%$0W";

    const MID =
        "3469*+X?";

    const LIGHT =
        "1/7=:-<>";

    const targets = [];

    for (
        let gy = 0;
        gy < rows;
        gy++
    ) {
        for (
            let gx = 0;
            gx < cols;
            gx++
        ) {
            const i =
                (gy * cols + gx) * 4;

            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const a = data[i + 3];

            if (a < 40) {
                continue;
            }

            const brightness =
                (r + g + b) / 3;

            const saturation =
                Math.max(r, g, b) -
                Math.min(r, g, b);

            /*
                skips white AND the
                light-grey checkerboard background
            */

            if (
                brightness >= 228 &&
                saturation <= 28
            ) {
                continue;
            }

            const darkness =
                1 - brightness / 255;

            const set =
                darkness > 0.6
                    ? DARK
                    : darkness > 0.35
                        ? MID
                        : LIGHT;

            const pick =
                Math.floor(
                    Math.abs(
                        Math.sin(
                            gx * 12.9898 +
                            gy * 78.233
                        )
                    ) * set.length
                ) % set.length;

            targets.push({
                x:
                    (gx + 0.5) *
                    cell,

                y:
                    (gy + 0.5) *
                    cell,

                ch:
                    set[pick],

                style:
                    `rgba(${r},${g},${b},${
                        0.6 +
                        darkness * 0.4
                    })`
            });
        }
    }

    return {
        targets,
        size: cell * 1.3
    };
}


function reconstruct(
    targets,
    size,
    duration = 2800
) {
    return new Promise((resolve) => {

        const width =
            dataCanvas.width;

        const height =
            dataCanvas.height;

        const count =
            particles.length;

        const starts =
            particles.map(
                (p, i) =>
                    fieldPosition(
                        p,
                        i,
                        width,
                        height
                    )
            );

        const spread = 0.35;

        const items =
            targets.map(
                (t, i) => {

                    const s =
                        starts[
                            i % count
                        ];

                    return {
                        t,

                        sx: s.x,

                        sy: s.y,

                        phase:
                            particles[
                                i % count
                            ].phase,

                        delay:
                            Math.abs(
                                Math.sin(
                                    i * 12.9898 +
                                    4.1
                                )
                            ) * spread
                    };
                }
            );

        const startTime =
            performance.now();

        function frame(now) {
            const p =
                Math.min(
                    1,
                    (now - startTime) /
                    duration
                );

            const ctx =
                dataContext;

            ctx.clearRect(
                0,
                0,
                width,
                height
            );

            ctx.font =
                `${size}px monospace`;

            ctx.textAlign =
                "center";

            ctx.textBaseline =
                "middle";

            for (const it of items) {

                let q =
                    (p - it.delay) /
                    (1 - spread);

                q =
                    Math.max(
                        0,
                        Math.min(1, q)
                    );

                const e =
                    q * q * (3 - 2 * q);

                const curve =
                    Math.sin(
                        q * Math.PI
                    ) * 30;

                const x =
                    it.sx +
                    (it.t.x - it.sx) *
                        e +
                    Math.sin(
                        it.phase +
                        q * Math.PI * 3
                    ) * curve;

                const y =
                    it.sy +
                    (it.t.y - it.sy) *
                        e +
                    Math.cos(
                        it.phase +
                        q * Math.PI * 3
                    ) * curve;

                ctx.globalAlpha =
                    0.35 + 0.65 * e;

                ctx.fillStyle =
                    it.t.style;

                ctx.fillText(
                    it.t.ch,
                    x,
                    y
                );
            }

            ctx.globalAlpha = 1;

            if (p < 1) {
                animationFrame =
                    requestAnimationFrame(
                        frame
                    );
            } else {
                animationFrame = null;
                resolve();
            }
        }

        animationFrame =
            requestAnimationFrame(frame);
    });
}


function loadResultImage(result) {
    return new Promise(
        (resolve, reject) => {

            const img =
                new Image();

            img.onload = () =>
                resolve(img);

            img.onerror = () =>
                reject(
                    new Error(
                        "Could not read the transformed drawing."
                    )
                );

            img.src =
                `data:${result.mime_type};base64,${result.image}`;
        }
    );
}


/* =========================================================
   PREPARE THE UPLOAD
========================================================= */

function roundTo16(value) {
    return Math.min(
        1024,
        Math.max(
            256,
            Math.round(value / 16) * 16
        )
    );
}


function prepareUpload() {
    return new Promise(
        (resolve, reject) => {

            const w =
                previewImage.naturalWidth;

            const h =
                previewImage.naturalHeight;

            if (!w || !h) {
                reject(
                    new Error(
                        "Could not read the drawing."
                    )
                );

                return;
            }

            const refScale =
                Math.min(
                    1,
                    496 /
                    Math.max(w, h)
                );

            const canvas =
                document.createElement(
                    "canvas"
                );

            canvas.width =
                Math.max(
                    1,
                    Math.round(
                        w * refScale
                    )
                );

            canvas.height =
                Math.max(
                    1,
                    Math.round(
                        h * refScale
                    )
                );

            const ctx =
                canvas.getContext("2d");

            ctx.fillStyle =
                "#ffffff";

            ctx.fillRect(
                0,
                0,
                canvas.width,
                canvas.height
            );

            ctx.drawImage(
                previewImage,
                0,
                0,
                canvas.width,
                canvas.height
            );

            const outScale =
                1024 /
                Math.max(w, h);

            canvas.toBlob(
                (blob) => {

                    if (!blob) {
                        reject(
                            new Error(
                                "Could not prepare the image."
                            )
                        );

                        return;
                    }

                    resolve({
                        blob,

                        width:
                            roundTo16(
                                w * outScale
                            ),

                        height:
                            roundTo16(
                                h * outScale
                            )
                    });
                },
                "image/png"
            );
        }
    );
}


/* =========================================================
   MAIN TRANSFORMATION
========================================================= */

async function transformDrawing() {

    if (getAttemptsRemaining() <= 0) {
        setStatus(
            "You have used all 5 transformations."
        );

        updateAttemptsUI();

        return;
    }


    if (!selectedFile) {
        setStatus(
            "Upload a drawing first."
        );

        return;
    }


    const action =
        actionInput.value.trim();


    if (!action) {
        setStatus(
            "Tell the drawing what should happen first."
        );

        actionInput.focus();

        return;
    }


    const supportedTypes = [
        "image/png",
        "image/jpeg",
        "image/webp"
    ];


    if (
        !supportedTypes.includes(
            selectedFile.type
        )
    ) {
        setStatus(
            "Please use a PNG, JPG or WebP image."
        );

        return;
    }


    if (!consumeAttempt()) {
        setStatus(
            "You have used all 5 transformations."
        );

        return;
    }


    bringToLife.disabled = true;
    actionInput.disabled = true;

    stopIdle();


    if (animationFrame) {
        cancelAnimationFrame(
            animationFrame
        );

        animationFrame = null;
    }


    try {

        /* 1. Drawing -> real data */

        previewImage.style.transition =
            "none";

        previewImage.style.opacity =
            "1";

        createDataCanvas();


        if (!prepareParticles()) {
            throw new Error(
                "Could not extract data from the drawing."
            );
        }


        /* 2. Ask the AI while animation plays */

        const upload =
            await prepareUpload();

        const formData =
            new FormData();

        formData.append(
            "file",
            upload.blob,
            "drawing.png"
        );

        formData.append(
            "action",
            action
        );

        formData.append(
            "width",
            String(upload.width)
        );

        formData.append(
            "height",
            String(upload.height)
        );


        const request =
            fetch(
                "/transform",
                {
                    method: "POST",
                    body: formData
                }
            );


        /* 3. Drawing -> data -> reorganized data */

        setStatus(
            "Scanning your drawing..."
        );

        await animateData(4200);


        /* 4. Data keeps living while we wait */

        setStatus(
            "Reconstructing your drawing..."
        );

        startIdle();


        const response =
            await request;

        const result =
            await response.json();


        if (!response.ok) {
            throw new Error(
                result.detail ||
                "The transformation failed."
            );
        }


        if (
            !result.success ||
            !result.image
        ) {
            throw new Error(
                "The server returned no transformed image."
            );
        }


        const resultImage =
            await loadResultImage(
                result
            );


        /* debug mode */

        if (
            location.search.includes(
                "debug"
            )
        ) {
            resultImage.style.cssText =
                "max-width:300px;display:block;margin:12px 0;border:1px solid #ccc";

            document.body.appendChild(
                resultImage
            );
        }


        stopIdle();


        /* 5. Data reconstructs the drawing */

        const {
            targets,
            size
        } = buildTargets(
            resultImage,
            dataCanvas.width,
            dataCanvas.height
        );


        if (targets.length === 0) {
            throw new Error(
                "The transformed drawing had nothing to rebuild from."
            );
        }


        await reconstruct(
            targets,
            size
        );


        setStatus(
            "Your drawing came to life."
        );


        if (tryAgain) {
            tryAgain.classList.remove(
                "hidden"
            );
        }


    } catch (error) {

        stopIdle();


        if (animationFrame) {
            cancelAnimationFrame(
                animationFrame
            );

            animationFrame = null;
        }


        if (dataCanvas) {
            dataCanvas.remove();

            dataCanvas = null;
            dataContext = null;
        }


        previewImage.style.opacity =
            "1";


        console.error(
            "Transform error:",
            error
        );


        setStatus(
            error.message ||
            "Something went wrong."
        );


    } finally {

        actionInput.disabled =
            false;


        if (
            getAttemptsRemaining() > 0
        ) {
            bringToLife.disabled =
                false;
        }


        updateAttemptsUI();
    }
}


/* =========================================================
   EVENTS
========================================================= */

bringToLife.addEventListener(
    "click",
    transformDrawing
);


if (tryAgain) {
    tryAgain.addEventListener(
        "click",
        resetToUpload
    );
}


actionInput.addEventListener(
    "keydown",
    (event) => {

        if (event.key === "Enter") {
            event.preventDefault();

            transformDrawing();
        }
    }
);


/* =========================================================
   INITIAL UI
========================================================= */

updateAttemptsUI();