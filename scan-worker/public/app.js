const fileInput = document.getElementById("fileInput");
const uploadPanel = document.getElementById("uploadPanel");
const previewPanel = document.getElementById("previewPanel");
const previewImage = document.getElementById("previewImage");
const actionInput = document.getElementById("actionInput");
const bringToLife = document.getElementById("bringToLife");
const tryAgain = document.getElementById("tryAgain");
const statusEl = document.getElementById("status");

let selectedFile = null;

let dataCanvas = null;
let dataContext = null;

let animationFrame = null;
let idleFrame = null;

let particles = [];


/* =========================================================
   STATUS
========================================================= */

function setStatus(text) {
    if (statusEl) {
        statusEl.textContent = text;
    }
}


/* =========================================================
   ANIMATION CONTROL
========================================================= */

function stopAnimation() {
    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }
}

function stopIdle() {
    if (idleFrame) {
        cancelAnimationFrame(idleFrame);
        idleFrame = null;
    }
}

function clearDataCanvas() {
    if (dataCanvas) {
        dataCanvas.remove();
        dataCanvas = null;
        dataContext = null;
    }
}


/* =========================================================
   RESET
========================================================= */

function resetToUpload() {
    stopAnimation();
    stopIdle();
    clearDataCanvas();

    particles = [];
    selectedFile = null;

    previewImage.onload = null;
    previewImage.onerror = null;
    previewImage.src = "";
    previewImage.style.opacity = "1";

    actionInput.value = "";
    actionInput.disabled = false;

    fileInput.value = "";

    tryAgain.classList.add("hidden");

    uploadPanel.classList.remove("hidden");
    previewPanel.classList.add("hidden");

    setStatus("");
}


/* =========================================================
   GLOBAL ERRORS
========================================================= */

window.addEventListener("error", (event) => {
    setStatus("Error: " + event.message);
});

window.addEventListener("unhandledrejection", (event) => {
    setStatus(
        "Error: " +
        ((event.reason && event.reason.message) || event.reason)
    );
});


/* =========================================================
   LOAD IMAGE
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

    tryAgain.classList.add("hidden");

    const reader = new FileReader();

    reader.onload = () => {
        previewImage.onload = () => {
            stopAnimation();
            stopIdle();
            clearDataCanvas();

            particles = [];

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
        setStatus(
            "Something went wrong while reading the image."
        );
    };

    reader.readAsDataURL(file);
}

fileInput.addEventListener("change", (event) => {
    const file = event.target.files[0];

    if (file) {
        loadImage(file);
    }

    fileInput.value = "";
});


/* =========================================================
   DATA CANVAS
========================================================= */

function createDataCanvas() {
    const wrapper = previewImage.parentElement;

    if (!wrapper) {
        throw new Error("Image wrapper not found.");
    }

    wrapper.style.position = "relative";

    clearDataCanvas();

    dataCanvas = document.createElement("canvas");

    dataCanvas.style.position = "absolute";
    dataCanvas.style.inset = "0";
    dataCanvas.style.width = "100%";
    dataCanvas.style.height = "100%";
    dataCanvas.style.pointerEvents = "none";
    dataCanvas.style.zIndex = "10";

    wrapper.appendChild(dataCanvas);

    dataCanvas.width = previewImage.naturalWidth;
    dataCanvas.height = previewImage.naturalHeight;

    dataContext = dataCanvas.getContext("2d");
}


/* =========================================================
   DATA CHARACTERS
========================================================= */

const DATA_CHARS =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz+-=*/#%&@$<>[]{}()^~|";


function getCharacter(r, g, b, x, y) {
    const value =
        Math.abs(
            r * 3 +
            g * 5 +
            b * 7 +
            x * 11 +
            y * 13
        );

    return DATA_CHARS[
        value % DATA_CHARS.length
    ];
}


/* =========================================================
   EXTRACT ORIGINAL DRAWING INTO DATA
========================================================= */

function extractDrawingParticles() {
    const source =
        document.createElement("canvas");

    const ctx =
        source.getContext(
            "2d",
            {
                willReadFrequently: true
            }
        );

    const maxDimension = 760;

    let width =
        previewImage.naturalWidth;

    let height =
        previewImage.naturalHeight;

    if (!width || !height) {
        throw new Error(
            "Could not read the drawing."
        );
    }

    const scale =
        Math.min(
            1,
            maxDimension /
            Math.max(width, height)
        );

    width =
        Math.max(
            1,
            Math.round(width * scale)
        );

    height =
        Math.max(
            1,
            Math.round(height * scale)
        );

    source.width = width;
    source.height = height;

    ctx.fillStyle = "#ffffff";

    ctx.fillRect(
        0,
        0,
        width,
        height
    );

    ctx.drawImage(
        previewImage,
        0,
        0,
        width,
        height
    );

    const pixels =
        ctx.getImageData(
            0,
            0,
            width,
            height
        ).data;

    const result = [];

    /*
     * Dense grid based directly on
     * the actual pixels of the drawing.
     */
    const step =
        Math.max(
            3,
            Math.round(
                Math.max(width, height) / 180
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
                (
                    y * width +
                    x
                ) * 4;

            const r = pixels[index];
            const g = pixels[index + 1];
            const b = pixels[index + 2];

            const brightness =
                (
                    r +
                    g +
                    b
                ) / 3;

            const saturation =
                Math.max(r, g, b) -
                Math.min(r, g, b);

            const background =
                brightness > 238 &&
                saturation < 15;

            result.push({
                x:
                    (
                        x / width
                    ) *
                    dataCanvas.width,

                y:
                    (
                        y / height
                    ) *
                    dataCanvas.height,

                character:
                    getCharacter(
                        r,
                        g,
                        b,
                        x,
                        y
                    ),

                r,
                g,
                b,

                darkness:
                    1 -
                    brightness / 255,

                background,

                phase:
                    (
                        x * 0.031 +
                        y * 0.047
                    ) %
                    (
                        Math.PI * 2
                    )
            });
        }
    }

    return result;
}


function prepareParticles() {
    particles =
        extractDrawingParticles();

    return particles.length > 0;
}


/* =========================================================
   DRAW ONE DATA CHARACTER
========================================================= */

function drawParticle(
    particle,
    x,
    y,
    size,
    alpha
) {
    const ctx = dataContext;

    ctx.font =
        `${size}px monospace`;

    ctx.fillStyle =
        `rgba(${particle.r},${particle.g},${particle.b},${alpha})`;

    ctx.fillText(
        particle.character,
        x,
        y
    );
}


/* =========================================================
   DRAWING → DATA
========================================================= */

function drawDataStage(progress) {
    if (!dataContext || !dataCanvas) {
        return;
    }

    const ctx = dataContext;

    const width =
        dataCanvas.width;

    const height =
        dataCanvas.height;

    ctx.clearRect(
        0,
        0,
        width,
        height
    );

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";


    /* -----------------------------------------------------
       PHASE 1
       Original drawing dissolves into its own data.
    ----------------------------------------------------- */

    if (progress < 0.30) {
        const p =
            progress / 0.30;

        const eased =
            p * p * (3 - 2 * p);

        previewImage.style.opacity =
            String(1 - eased);

        for (const particle of particles) {
            const alpha =
                particle.background
                    ? 0.015 + eased * 0.025
                    : 0.10 +
                      eased *
                      (
                          0.78 +
                          particle.darkness * 0.22
                      );

            const size =
                particle.background
                    ? 5
                    : 6 +
                      particle.darkness * 5;

            drawParticle(
                particle,
                particle.x,
                particle.y,
                size,
                alpha
            );
        }

        return;
    }


    /* -----------------------------------------------------
       PHASE 2
       The drawing is now completely data.
    ----------------------------------------------------- */

    if (progress < 0.56) {
        const p =
            (
                progress - 0.30
            ) / 0.26;

        previewImage.style.opacity = "0";

        for (const particle of particles) {
            const movement =
                5 +
                p *
                (
                    20 +
                    particle.darkness * 45
                );

            const wave =
                Math.sin(
                    particle.phase +
                    p * Math.PI * 8
                );

            const x =
                particle.x +
                Math.cos(
                    particle.phase
                ) *
                movement +
                wave * 4;

            const y =
                particle.y +
                Math.sin(
                    particle.phase
                ) *
                movement +
                Math.cos(
                    particle.phase +
                    p * 4
                ) *
                4;

            const alpha =
                particle.background
                    ? 0.025
                    : 0.45 +
                      particle.darkness * 0.50;

            const size =
                particle.background
                    ? 5
                    : 6 +
                      particle.darkness * 5;

            drawParticle(
                particle,
                x,
                y,
                size,
                alpha
            );
        }

        return;
    }


    /* -----------------------------------------------------
       PHASE 3
       Data separates into a large data field.
    ----------------------------------------------------- */

    if (progress < 0.84) {
        const p =
            (
                progress - 0.56
            ) / 0.28;

        const eased =
            p * p * (3 - 2 * p);

        previewImage.style.opacity = "0";

        for (
            let i = 0;
            i < particles.length;
            i++
        ) {
            const particle =
                particles[i];

            const hashX =
                Math.abs(
                    Math.sin(
                        particle.x * 0.019 +
                        particle.y * 0.013 +
                        i * 0.071
                    )
                );

            const hashY =
                Math.abs(
                    Math.cos(
                        particle.x * 0.017 +
                        particle.y * 0.029 +
                        i * 0.053
                    )
                );

            const targetX =
                width *
                (
                    0.03 +
                    hashX * 0.94
                );

            const targetY =
                height *
                (
                    0.03 +
                    hashY * 0.94
                );

            const startX =
                particle.x +
                Math.cos(
                    particle.phase
                ) * 24;

            const startY =
                particle.y +
                Math.sin(
                    particle.phase
                ) * 24;

            const curve =
                Math.sin(
                    p * Math.PI
                ) * 45;

            const x =
                startX +
                (
                    targetX -
                    startX
                ) *
                eased +
                Math.sin(
                    particle.phase +
                    p * Math.PI * 7
                ) *
                curve;

            const y =
                startY +
                (
                    targetY -
                    startY
                ) *
                eased +
                Math.cos(
                    particle.phase +
                    p * Math.PI * 6
                ) *
                curve;

            const alpha =
                particle.background
                    ? 0.025
                    : 0.38 +
                      particle.darkness * 0.48;

            const size =
                particle.background
                    ? 5
                    : 6 +
                      particle.darkness * 5;

            drawParticle(
                particle,
                x,
                y,
                size,
                alpha
            );
        }

        return;
    }


    /* -----------------------------------------------------
       PHASE 4
       Hold the complete data field.
    ----------------------------------------------------- */

    previewImage.style.opacity = "0";

    for (
        let i = 0;
        i < particles.length;
        i++
    ) {
        const particle =
            particles[i];

        const hashX =
            Math.abs(
                Math.sin(
                    particle.x * 0.019 +
                    particle.y * 0.013 +
                    i * 0.071
                )
            );

        const hashY =
            Math.abs(
                Math.cos(
                    particle.x * 0.017 +
                    particle.y * 0.029 +
                    i * 0.053
                )
            );

        const x =
            width *
            (
                0.03 +
                hashX * 0.94
            );

        const y =
            height *
            (
                0.03 +
                hashY * 0.94
            );

        const alpha =
            particle.background
                ? 0.025
                : 0.40 +
                  particle.darkness * 0.45;

        const size =
            particle.background
                ? 5
                : 6 +
                  particle.darkness * 5;

        drawParticle(
            particle,
            x,
            y,
            size,
            alpha
        );
    }
}


/* =========================================================
   DATA ANIMATION
========================================================= */

function animateData(duration = 6500) {
    return new Promise((resolve) => {
        const start =
            performance.now();

        function frame(now) {
            const progress =
                Math.min(
                    1,
                    (
                        now - start
                    ) /
                    duration
                );

            drawDataStage(progress);

            if (progress < 1) {
                animationFrame =
                    requestAnimationFrame(frame);
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
   HOLD DATA
========================================================= */

function holdData(duration = 1400) {
    return new Promise((resolve) => {
        const start =
            performance.now();

        function frame(now) {
            const progress =
                Math.min(
                    1,
                    (
                        now - start
                    ) /
                    duration
                );

            if (dataContext) {
                dataContext.globalAlpha =
                    0.94 +
                    Math.sin(
                        progress * Math.PI
                    ) * 0.06;
            }

            if (progress < 1) {
                animationFrame =
                    requestAnimationFrame(frame);
            } else {
                if (dataContext) {
                    dataContext.globalAlpha = 1;
                }

                animationFrame = null;
                resolve();
            }
        }

        animationFrame =
            requestAnimationFrame(frame);
    });
}


/* =========================================================
   DATA FIELD IDLE
========================================================= */

function getDataFieldPosition(
    particle,
    index,
    width,
    height
) {
    const hashX =
        Math.abs(
            Math.sin(
                particle.x * 0.019 +
                particle.y * 0.013 +
                index * 0.071
            )
        );

    const hashY =
        Math.abs(
            Math.cos(
                particle.x * 0.017 +
                particle.y * 0.029 +
                index * 0.053
            )
        );

    return {
        x:
            width *
            (
                0.03 +
                hashX * 0.94
            ),

        y:
            height *
            (
                0.03 +
                hashY * 0.94
            )
    };
}


function startIdle() {
    if (!dataCanvas || !dataContext) {
        return;
    }

    const width =
        dataCanvas.width;

    const height =
        dataCanvas.height;

    const positions =
        particles.map(
            (particle, index) =>
                getDataFieldPosition(
                    particle,
                    index,
                    width,
                    height
                )
        );

    function frame(now) {
        if (!dataContext) {
            return;
        }

        const time =
            now / 1000;

        const ctx =
            dataContext;

        ctx.clearRect(
            0,
            0,
            width,
            height
        );

        ctx.textAlign =
            "center";

        ctx.textBaseline =
            "middle";

        for (
            let i = 0;
            i < particles.length;
            i++
        ) {
            const particle =
                particles[i];

            const position =
                positions[i];

            const alpha =
                particle.background
                    ? 0.025
                    : 0.30 +
                      particle.darkness * 0.43;

            const size =
                particle.background
                    ? 5
                    : 6 +
                      particle.darkness * 5;

            drawParticle(
                particle,

                position.x +
                    Math.sin(
                        time * 1.1 +
                        particle.phase
                    ) * 4,

                position.y +
                    Math.cos(
                        time * 1.2 +
                        particle.phase
                    ) * 4,

                size,
                alpha
            );
        }

        idleFrame =
            requestAnimationFrame(frame);
    }

    idleFrame =
        requestAnimationFrame(frame);
}


/* =========================================================
   AI RESULT → TARGET DATA
   IMPORTANT:
   The AI image is NEVER displayed.
   It is only read as pixel information.
========================================================= */

function buildTargets(
    image,
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
        document.createElement("canvas");

    small.width = cols;
    small.height = rows;

    const ctx =
        small.getContext(
            "2d",
            {
                willReadFrequently: true
            }
        );

    /*
     * AI result exists only in this
     * hidden/offscreen canvas.
     */
    ctx.clearRect(
        0,
        0,
        cols,
        rows
    );

    ctx.drawImage(
        image,
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

    /*
     * Character sets represent brightness.
     */
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
            const index =
                (
                    gy * cols +
                    gx
                ) * 4;

            const r =
                data[index];

            const g =
                data[index + 1];

            const b =
                data[index + 2];

            const a =
                data[index + 3];

            if (a < 40) {
                continue;
            }

            const brightness =
                (
                    r +
                    g +
                    b
                ) / 3;

            const saturation =
                Math.max(r, g, b) -
                Math.min(r, g, b);

            /*
             * Ignore almost pure transparent/white
             * pixels so the result remains clean.
             */
            if (
                brightness >= 232 &&
                saturation <= 22
            ) {
                continue;
            }

            const darkness =
                1 -
                brightness / 255;

            const characterSet =
                darkness > 0.62
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
                    ) *
                    characterSet.length
                ) %
                characterSet.length;

            targets.push({
                x:
                    (
                        gx + 0.5
                    ) *
                    cell,

                y:
                    (
                        gy + 0.5
                    ) *
                    cell,

                character:
                    characterSet[pick],

                r,
                g,
                b,

                alpha:
                    0.55 +
                    darkness * 0.45
            });
        }
    }

    return {
        targets,
        size:
            Math.max(
                7,
                cell * 1.15
            )
    };
}


/* =========================================================
   LOAD AI RESULT
   ONLY USED AS HIDDEN PIXEL DATA
========================================================= */

function loadResultImage(result) {
    return new Promise(
        (resolve, reject) => {
            const image =
                new Image();

            image.onload =
                () => resolve(image);

            image.onerror =
                () => reject(
                    new Error(
                        "Could not read the transformed drawing."
                    )
                );

            image.src =
                `data:${result.mime_type};base64,${result.image}`;
        }
    );
}


/* =========================================================
   PREPARE ORIGINAL IMAGE FOR AI
========================================================= */

function prepareUpload() {
    return new Promise(
        (resolve, reject) => {
            const width =
                previewImage.naturalWidth;

            const height =
                previewImage.naturalHeight;

            if (!width || !height) {
                reject(
                    new Error(
                        "Could not read the drawing."
                    )
                );

                return;
            }

            const scale =
                Math.min(
                    1,
                    496 /
                    Math.max(
                        width,
                        height
                    )
                );

            const canvas =
                document.createElement("canvas");

            canvas.width =
                Math.max(
                    1,
                    Math.round(
                        width * scale
                    )
                );

            canvas.height =
                Math.max(
                    1,
                    Math.round(
                        height * scale
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

            const outputScale =
                1024 /
                Math.max(
                    width,
                    height
                );

            function roundTo16(value) {
                return Math.min(
                    1024,
                    Math.max(
                        256,
                        Math.round(
                            value / 16
                        ) * 16
                    )
                );
            }

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
                                width *
                                outputScale
                            ),

                        height:
                            roundTo16(
                                height *
                                outputScale
                            )
                    });
                },
                "image/png"
            );
        }
    );
}


/* =========================================================
   DATA → FINAL TRANSFORMED DRAWING
   IMPORTANT:
   FINAL RESULT IS ONLY CHARACTERS.
   NO AI IMAGE IS REVEALED.
========================================================= */

function reconstruct(
    targets,
    size,
    duration = 3600
) {
    return new Promise((resolve) => {
        const width =
            dataCanvas.width;

        const height =
            dataCanvas.height;

        const count =
            particles.length;

        if (!count) {
            resolve();
            return;
        }

        const starts =
            particles.map(
                (particle, index) =>
                    getDataFieldPosition(
                        particle,
                        index,
                        width,
                        height
                    )
            );

        const items =
            targets.map(
                (target, index) => {
                    const source =
                        starts[
                            index % count
                        ];

                    const particle =
                        particles[
                            index % count
                        ];

                    return {
                        target,

                        startX:
                            source.x,

                        startY:
                            source.y,

                        phase:
                            particle.phase,

                        delay:
                            Math.abs(
                                Math.sin(
                                    index *
                                    12.9898 +
                                    4.1
                                )
                            ) * 0.28
                    };
                }
            );

        const startTime =
            performance.now();

        function frame(now) {
            const progress =
                Math.min(
                    1,
                    (
                        now -
                        startTime
                    ) /
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

            ctx.textAlign =
                "center";

            ctx.textBaseline =
                "middle";

            for (const item of items) {
                let local =
                    (
                        progress -
                        item.delay
                    ) /
                    0.72;

                local =
                    Math.max(
                        0,
                        Math.min(
                            1,
                            local
                        )
                    );

                const eased =
                    local * local *
                    (
                        3 -
                        2 * local
                    );

                const curve =
                    Math.sin(
                        local * Math.PI
                    ) * 26;

                const x =
                    item.startX +
                    (
                        item.target.x -
                        item.startX
                    ) *
                    eased +
                    Math.sin(
                        item.phase +
                        local *
                        Math.PI *
                        3
                    ) *
                    curve;

                const y =
                    item.startY +
                    (
                        item.target.y -
                        item.startY
                    ) *
                    eased +
                    Math.cos(
                        item.phase +
                        local *
                        Math.PI *
                        3
                    ) *
                    curve;

                /*
                 * The FINAL visual is still made
                 * entirely from characters.
                 */
                ctx.globalAlpha =
                    0.15 +
                    0.85 * eased;

                ctx.font =
                    `${size}px monospace`;

                ctx.fillStyle =
                    `rgba(
                        ${item.target.r},
                        ${item.target.g},
                        ${item.target.b},
                        ${item.target.alpha}
                    )`;

                ctx.fillText(
                    item.target.character,
                    x,
                    y
                );
            }

            ctx.globalAlpha = 1;

            if (progress < 1) {
                animationFrame =
                    requestAnimationFrame(frame);

                return;
            }

            animationFrame = null;

            /*
             * Keep the character reconstruction
             * visible. DO NOT reveal the AI image.
             */
            resolve();
        }

        animationFrame =
            requestAnimationFrame(frame);
    });
}


/* =========================================================
   MAIN TRANSFORMATION
========================================================= */

async function transformDrawing() {
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

    bringToLife.disabled = true;
    actionInput.disabled = true;

    stopAnimation();
    stopIdle();
    clearDataCanvas();

    previewImage.style.opacity = "1";

    try {

        /* ---------------------------------------------
           1. CREATE DATA FROM ORIGINAL DRAWING
        --------------------------------------------- */

        createDataCanvas();

        if (!prepareParticles()) {
            throw new Error(
                "Could not extract data from the drawing."
            );
        }


        /* ---------------------------------------------
           2. PREPARE ORIGINAL FOR AI
        --------------------------------------------- */

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


        /* ---------------------------------------------
           3. AI WORKS IN THE BACKGROUND

           IMPORTANT:
           Its image will NEVER be shown.
        --------------------------------------------- */

        const request =
            fetch(
                "/transform",
                {
                    method: "POST",
                    body: formData
                }
            );


        /* ---------------------------------------------
           4. ORIGINAL DRAWING → DATA
        --------------------------------------------- */

        setStatus(
            "Turning your drawing into data..."
        );

        await animateData(6500);


        /* ---------------------------------------------
           5. SHOW PURE DATA
        --------------------------------------------- */

        setStatus(
            "Your drawing is now data..."
        );

        await holdData(1400);


        /* ---------------------------------------------
           6. WAIT FOR AI TRANSFORMATION
        --------------------------------------------- */

        setStatus(
            "Reorganizing the data..."
        );

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


        /* ---------------------------------------------
           7. READ AI IMAGE OFFSCREEN

           This image is NEVER inserted into
           the visible page.
        --------------------------------------------- */

        const resultImage =
            await loadResultImage(
                result
            );


        /* ---------------------------------------------
           8. CONVERT AI RESULT INTO CHARACTERS

           This creates the final shape.
        --------------------------------------------- */

        const {
            targets,
            size
        } =
            buildTargets(
                resultImage,
                dataCanvas.width,
                dataCanvas.height
            );

        if (!targets.length) {
            throw new Error(
                "The transformed drawing had nothing to rebuild from."
            );
        }


        /* ---------------------------------------------
           9. DATA → TRANSFORMED DRAWING

           ONLY NUMBERS / LETTERS / SYMBOLS.
        --------------------------------------------- */

        setStatus(
            "Rebuilding the transformed drawing from data..."
        );

        await reconstruct(
            targets,
            size
        );


        /* ---------------------------------------------
           10. FINAL STATE

           The AI image is NEVER revealed.
        --------------------------------------------- */

        setStatus(
            "Your drawing came to life."
        );

        tryAgain.classList.remove(
            "hidden"
        );

    } catch (error) {
        stopAnimation();
        stopIdle();
        clearDataCanvas();

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
        actionInput.disabled = false;
        bringToLife.disabled = false;
    }
}


/* =========================================================
   EVENTS
========================================================= */

bringToLife.addEventListener(
    "click",
    transformDrawing
);

tryAgain.addEventListener(
    "click",
    resetToUpload
);

actionInput.addEventListener(
    "keydown",
    (event) => {
        if (event.key === "Enter") {
            event.preventDefault();

            transformDrawing();
        }
    }
);