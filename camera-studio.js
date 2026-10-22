const FILTERS = [
    { id: "original", name: "Original", icon: "✨", kind: "sparkles", css: "none" },
    { id: "glow", name: "Glow", icon: "💫", kind: "glow", css: "brightness(1.08) saturate(1.2)" },
    { id: "soft", name: "Soft", icon: "☁️", kind: "blush", css: "brightness(1.08) saturate(0.9)" },
    { id: "freckles", name: "Freckles", icon: "🌼", kind: "freckles", css: "saturate(1.12)" },
    { id: "cat", name: "Cat", icon: "🐱", kind: "cat", css: "saturate(1.08)" },
    { id: "puppy", name: "Puppy", icon: "🐶", kind: "puppy", css: "warm", },
    { id: "bunny", name: "Bunny", icon: "🐰", kind: "bunny", css: "brightness(1.05) saturate(1.15)" },
    { id: "heart-eyes", name: "Heart eyes", icon: "💗", kind: "heart-eyes", css: "saturate(1.18)" },
    { id: "starry", name: "Starry", icon: "⭐", kind: "starry", css: "contrast(1.05) saturate(1.2)" },
    { id: "flower", name: "Flower", icon: "🌸", kind: "flower", css: "brightness(1.05) saturate(1.18)" },
    { id: "angel", name: "Angel", icon: "😇", kind: "angel", css: "brightness(1.1) saturate(0.9)" },
    { id: "devil", name: "Devil", icon: "😈", kind: "devil", css: "contrast(1.05) saturate(1.2)" },
    { id: "retro", name: "Retro", icon: "🕶️", kind: "glasses", css: "sepia(.28) contrast(1.05) saturate(1.2)" },
    { id: "neon", name: "Neon", icon: "🔮", kind: "neon", css: "hue-rotate(12deg) saturate(1.45) contrast(1.05)" },
    { id: "butterfly", name: "Butterfly", icon: "🦋", kind: "butterfly", css: "saturate(1.18)" },
    { id: "crown", name: "Crown", icon: "👑", kind: "crown", css: "brightness(1.05) saturate(1.1)" },
    { id: "bear", name: "Bear", icon: "🐻", kind: "bear", css: "sepia(.12) saturate(1.12)" },
    { id: "fairy", name: "Fairy", icon: "🧚", kind: "fairy", css: "brightness(1.08) saturate(1.12)" },
    { id: "sunshine", name: "Sunshine", icon: "☀️", kind: "sunshine", css: "sepia(.16) saturate(1.3) brightness(1.04)" },
    { id: "moon", name: "Moon", icon: "🌙", kind: "moon", css: "hue-rotate(175deg) saturate(.88)" },
    { id: "rainbow", name: "Rainbow", icon: "🌈", kind: "rainbow", css: "saturate(1.3)" },
    { id: "ice", name: "Ice", icon: "❄️", kind: "ice", css: "hue-rotate(165deg) saturate(.82) brightness(1.08)" },
    { id: "blush", name: "Blush", icon: "🩷", kind: "blush", css: "hue-rotate(-8deg) saturate(1.1)" },
    { id: "sparkle", name: "Sparkle", icon: "✨", kind: "sparkles", css: "brightness(1.08) contrast(1.03)" }
];

const VISION_VERSION = "0.10.14";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const MAX_RECORDING_SECONDS = 15;

let panel, video, canvas, context, statusEl, timerEl, shutter, shutterLabel, filterList;
let stream = null;
let microphoneStream = null;
let recordingStream = null;
let recorder = null;
let recordingChunks = [];
let recordStartedAt = 0;
let timerInterval = null;
let stopTimeout = null;
let animationFrame = 0;
let activeFilter = FILTERS[0];
let mode = "photo";
let facingMode = "user";
let landmarker = null;
let landmarkerPromise = null;
let lastDetectionAt = 0;
let facePoints = [];
let initialized = false;
let cancellingRecording = false;

export function initCameraStudio() {
    if (!initialized) {
        panel = document.getElementById("camera-studio");
        video = document.getElementById("capture-camera-video");
        canvas = document.getElementById("capture-camera-canvas");
        statusEl = document.getElementById("camera-face-status");
        timerEl = document.getElementById("camera-record-timer");
        shutter = document.getElementById("camera-shutter");
        shutterLabel = document.getElementById("camera-shutter-label");
        filterList = document.getElementById("camera-filter-list");
        context = canvas?.getContext("2d", { alpha: false });
        if (!panel || !video || !canvas || !context || !shutter) return;
        buildFilters();
        document.getElementById("camera-close")?.addEventListener("click", () => stopCameraStudio());
        document.getElementById("camera-switch")?.addEventListener("click", switchCamera);
        shutter.addEventListener("click", onShutter);
        document.querySelectorAll("[data-camera-mode]").forEach(button => {
            button.addEventListener("click", () => setMode(button.dataset.cameraMode));
        });
        document.addEventListener("keydown", onKeyDown);
        window.addEventListener("hashchange", () => {
            if (location.hash !== "#/capture") stopCameraStudio();
        });
        initialized = true;
    }
    openCamera();
}

export function stopCameraStudio() {
    if (!panel) return;
    if (recorder && recorder.state !== "inactive") {
        cancellingRecording = true;
        try { recorder.stop(); } catch {}
    }
    cleanupCamera();
    panel.hidden = true;
    const picker = document.getElementById("capture-picker");
    if (picker && location.hash === "#/capture" && document.getElementById("capture-preview-block")?.hidden) {
        picker.hidden = false;
    }
}

function buildFilters() {
    if (!filterList || filterList.dataset.ready) return;
    filterList.innerHTML = FILTERS.map((filter, index) => `
        <button type="button" class="camera-filter-chip ${index === 0 ? "active" : ""}" data-filter-id="${filter.id}" aria-pressed="${index === 0}">
            <span class="camera-filter-icon" aria-hidden="true">${filter.icon}</span>
            <span>${filter.name}</span>
        </button>`).join("");
    filterList.querySelectorAll("[data-filter-id]").forEach(button => {
        button.addEventListener("click", () => {
            activeFilter = FILTERS.find(filter => filter.id === button.dataset.filterId) || FILTERS[0];
            filterList.querySelectorAll(".camera-filter-chip").forEach(chip => {
                const selected = chip === button;
                chip.classList.toggle("active", selected);
                chip.setAttribute("aria-pressed", String(selected));
            });
            if (facePoints.length) setStatus(`Face tracked · ${activeFilter.name}`);
        });
    });
    filterList.dataset.ready = "1";
}

async function openCamera() {
    panel.hidden = false;
    document.getElementById("capture-picker").hidden = true;
    document.getElementById("capture-preview-block").hidden = true;
    setStatus("Requesting camera access…");
    try {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error("Camera access needs a supported browser and a secure HTTPS connection.");
        }
        await startCameraStream();
        setMode(mode);
        startRenderLoop();
        loadFaceLandmarker();
    } catch (error) {
        cleanupCamera();
        panel.hidden = true;
        document.getElementById("capture-picker").hidden = false;
        dispatch("drop:camera-error", { message: error?.message || "Allow camera access and try again." });
    }
}

async function startCameraStream() {
    if (stream) stream.getTracks().forEach(track => track.stop());
    stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 1280 },
            frameRate: { ideal: 30, max: 30 }
        }
    });
    video.srcObject = stream;
    await video.play();
    setStatus("Loading face filters…");
}

async function switchCamera() {
    if (recorder && recorder.state !== "inactive") return;
    facingMode = facingMode === "user" ? "environment" : "user";
    try {
        await startCameraStream();
    } catch (error) {
        facingMode = facingMode === "user" ? "environment" : "user";
        dispatch("drop:camera-error", { message: error?.message || "Could not switch cameras." });
    }
}

async function loadFaceLandmarker() {
    if (landmarker) {
        setStatus("Face filters ready");
        return landmarker;
    }
    if (!landmarkerPromise) {
        landmarkerPromise = (async () => {
            const vision = await import(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}/+esm`);
            const files = await vision.FilesetResolver.forVisionTasks(
                `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}/wasm`
            );
            const options = {
                runningMode: "VIDEO",
                numFaces: 1,
                outputFaceBlendshapes: false,
                outputFacialTransformationMatrixes: false
            };
            try {
                return await vision.FaceLandmarker.createFromOptions(files, {
                    ...options,
                    baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" }
                });
            } catch {
                return vision.FaceLandmarker.createFromOptions(files, {
                    ...options,
                    baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" }
                });
            }
        })();
    }
    try {
        landmarker = await landmarkerPromise;
        if (!panel.hidden) setStatus("Face filters ready");
        return landmarker;
    } catch (error) {
        landmarkerPromise = null;
        if (!panel.hidden) setStatus("Color filters ready · face tracking needs internet");
        return null;
    }
}

function startRenderLoop() {
    cancelAnimationFrame(animationFrame);
    const draw = (timestamp) => {
        if (!panel || panel.hidden || !video?.videoWidth) return;
        const maxSide = 1280;
        const ratio = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
        const width = Math.max(2, Math.round(video.videoWidth * ratio));
        const height = Math.max(2, Math.round(video.videoHeight * ratio));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        context.save();
        if (facingMode === "user") {
            context.translate(width, 0);
            context.scale(-1, 1);
        }
        context.filter = activeFilter.css === "warm" ? "sepia(.16) saturate(1.2) brightness(1.04)" : activeFilter.css;
        context.drawImage(video, 0, 0, width, height);
        context.filter = "none";
        if (landmarker && timestamp - lastDetectionAt > 75) {
            lastDetectionAt = timestamp;
            try {
                const result = landmarker.detectForVideo(video, timestamp);
                facePoints = result.faceLandmarks?.[0] || [];
            } catch {
                facePoints = [];
            }
        }
        if (facePoints.length) {
            const points = facePoints.map(point => ({ x: point.x * width, y: point.y * height }));
            drawFilter(context, activeFilter.kind, points, width, height);
            if (activeFilter.kind !== "none" && activeFilter.kind !== "sparkles") {
                if (!statusEl.textContent.includes(activeFilter.name)) setStatus(`Face tracked · ${activeFilter.name}`);
            }
        } else if (landmarker && timestamp - lastDetectionAt < 600) {
            if (statusEl.textContent.startsWith("Face tracked")) setStatus("Center your face in the frame");
        }
        context.restore();
        animationFrame = requestAnimationFrame(draw);
    };
    animationFrame = requestAnimationFrame(draw);
}

function drawFilter(ctx, kind, points, width, height) {
    const at = (index) => points[index] || { x: width / 2, y: height / 2 };
    const leftCheek = at(234), rightCheek = at(454);
    const leftEye = at(33), rightEye = at(263);
    const nose = at(1), mouth = at(13), forehead = at(10), chin = at(152);
    const centerX = (leftCheek.x + rightCheek.x) / 2;
    const faceW = Math.max(40, Math.hypot(rightCheek.x - leftCheek.x, rightCheek.y - leftCheek.y));
    const eyeY = (leftEye.y + rightEye.y) / 2;
    const top = Math.min(forehead.y, eyeY - faceW * 0.42);
    const size = faceW * 0.18;

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (kind === "cat" || kind === "devil" || kind === "bear" || kind === "bunny" || kind === "puppy") {
        drawEars(ctx, kind, leftCheek, rightCheek, top, faceW);
    }
    if (kind === "cat") {
        drawNose(ctx, nose, size * 0.42, "#ff85a1");
        drawWhiskers(ctx, nose, faceW, "#fff");
    }
    if (kind === "puppy" || kind === "bear") {
        drawNose(ctx, nose, size * 0.48, kind === "bear" ? "#48302c" : "#352a28");
        drawMuzzle(ctx, nose, mouth, size, kind === "bear" ? "#d4b59d" : "#fff1ec");
    }
    if (kind === "bunny") {
        drawNose(ctx, nose, size * 0.4, "#ff9eb5");
        drawWhiskers(ctx, nose, faceW * 0.7, "#fff5f7");
    }
    if (kind === "heart-eyes") {
        drawEmoji(ctx, "💗", leftEye.x, leftEye.y, size * 1.35);
        drawEmoji(ctx, "💗", rightEye.x, rightEye.y, size * 1.35);
    }
    if (kind === "glasses" || kind === "neon") drawGlasses(ctx, leftEye, rightEye, size, kind === "neon");
    if (kind === "freckles" || kind === "blush" || kind === "soft") drawCheekGlow(ctx, leftCheek, rightCheek, faceW, kind);
    if (kind === "crown" || kind === "devil") drawCrown(ctx, centerX, top, faceW, kind);
    if (kind === "angel") drawHalo(ctx, centerX, top, faceW);
    if (kind === "flower") drawFlowers(ctx, centerX, top, faceW);
    if (kind === "butterfly") {
        drawEmoji(ctx, "🦋", leftCheek.x - size * 0.25, top + faceW * 0.1, size * 1.6);
        drawEmoji(ctx, "🦋", rightCheek.x + size * 0.25, top + faceW * 0.1, size * 1.6);
    }
    if (kind === "starry" || kind === "fairy" || kind === "sparkles" || kind === "glow") drawSparkles(ctx, centerX, top, faceW, kind);
    if (kind === "sunshine") {
        drawEmoji(ctx, "☀️", centerX, top - faceW * 0.14, size * 1.55);
        drawCheekGlow(ctx, leftCheek, rightCheek, faceW, "soft");
    }
    if (kind === "moon") {
        drawEmoji(ctx, "🌙", centerX + faceW * 0.48, top + faceW * 0.16, size * 1.1);
        drawEmoji(ctx, "✨", centerX - faceW * 0.5, top + faceW * 0.38, size * 0.6);
    }
    if (kind === "rainbow") drawRainbow(ctx, centerX, top, faceW);
    if (kind === "ice") {
        drawEmoji(ctx, "❄️", leftCheek.x - size, leftCheek.y, size * 0.75);
        drawEmoji(ctx, "❄️", rightCheek.x + size, rightCheek.y, size * 0.75);
        drawCheekGlow(ctx, leftCheek, rightCheek, faceW, "soft");
    }
    if (kind === "fairy") {
        drawEmoji(ctx, "🧚", centerX + faceW * 0.56, eyeY, size * 1.25);
        drawSparkleShape(ctx, centerX - faceW * 0.5, top + faceW * 0.34, size * 0.45, "#ffdc82");
    }
    if (kind === "glow" || kind === "sparkles") drawSparkleShape(ctx, centerX, top - size * 0.5, size * 0.55, "#fff4bd");
    if (kind === "starry") {
        drawEmoji(ctx, "⭐", leftCheek.x - size * 0.35, eyeY + faceW * 0.32, size * 0.55);
        drawEmoji(ctx, "⭐", rightCheek.x + size * 0.35, eyeY + faceW * 0.32, size * 0.55);
    }
    if (kind === "fairy" || kind === "butterfly" || kind === "flower") {
        drawEmoji(ctx, "✨", centerX - faceW * 0.5, top + faceW * 0.56, size * 0.5);
        drawEmoji(ctx, "✨", centerX + faceW * 0.5, top + faceW * 0.56, size * 0.5);
    }
    if (kind === "devil") {
        drawNose(ctx, nose, size * 0.33, "#ff5a68");
        drawEmoji(ctx, "😈", centerX, mouth.y + faceW * 0.18, size * 0.8);
    }
    if (kind === "angel") {
        drawEmoji(ctx, "✨", leftCheek.x - size * 0.4, eyeY + faceW * 0.36, size * 0.45);
        drawEmoji(ctx, "✨", rightCheek.x + size * 0.4, eyeY + faceW * 0.36, size * 0.45);
    }
    if (kind === "rainbow" || kind === "ice" || kind === "sunshine") {
        drawEmoji(ctx, "✨", centerX + faceW * 0.54, top + faceW * 0.42, size * 0.5);
    }
    ctx.restore();
}

function drawEmoji(ctx, emoji, x, y, size) {
    ctx.save();
    ctx.font = `${Math.max(12, size)}px "Apple Color Emoji","Segoe UI Emoji",sans-serif`;
    ctx.fillText(emoji, x, y);
    ctx.restore();
}

function drawEars(ctx, kind, left, right, top, faceW) {
    const floppy = kind === "puppy";
    const bunny = kind === "bunny";
    const bear = kind === "bear";
    const outer = kind === "devil" ? "#ed4b59" : kind === "cat" ? "#2f2738" : kind === "bear" ? "#8d5c47" : "#ff9db5";
    const inner = kind === "devil" ? "#ffc0c6" : "#ffc1d1";
    const earW = faceW * (bunny ? 0.18 : 0.2);
    const earH = faceW * (bunny ? 0.62 : 0.38);
    const points = [
        { x: left.x - faceW * 0.07, y: top + faceW * 0.15, direction: -1 },
        { x: right.x + faceW * 0.07, y: top + faceW * 0.15, direction: 1 }
    ];
    points.forEach(({ x, y, direction }) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(direction * (floppy ? 0.42 : bunny ? 0.12 : 0.2));
        if (bear) {
            ctx.fillStyle = outer;
            ctx.beginPath();
            ctx.ellipse(0, -earH * 0.35, earW * 0.62, earW * 0.62, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = inner;
            ctx.beginPath();
            ctx.ellipse(0, -earH * 0.35, earW * 0.3, earW * 0.3, 0, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillStyle = outer;
            ctx.beginPath();
            ctx.moveTo(-earW / 2, 0);
            ctx.quadraticCurveTo(-earW * 0.7, -earH * 0.4, 0, -earH);
            ctx.quadraticCurveTo(earW * 0.65, -earH * 0.35, earW / 2, 0);
            ctx.closePath();
            ctx.fill();
            if (kind !== "cat" && kind !== "puppy") {
                ctx.fillStyle = inner;
                ctx.beginPath();
                ctx.moveTo(-earW * 0.23, -earH * 0.1);
                ctx.quadraticCurveTo(-earW * 0.28, -earH * 0.42, 0, -earH * 0.73);
                ctx.quadraticCurveTo(earW * 0.28, -earH * 0.4, earW * 0.23, -earH * 0.1);
                ctx.closePath();
                ctx.fill();
            }
        }
        ctx.restore();
    });
}

function drawNose(ctx, nose, size, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(nose.x - size, nose.y - size * 0.35);
    ctx.quadraticCurveTo(nose.x, nose.y + size * 1.15, nose.x + size, nose.y - size * 0.35);
    ctx.quadraticCurveTo(nose.x, nose.y - size * 0.9, nose.x - size, nose.y - size * 0.35);
    ctx.fill();
    ctx.restore();
}

function drawMuzzle(ctx, nose, mouth, size, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.ellipse(mouth.x, mouth.y + size * 0.45, size * 1.65, size * 0.78, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#644147";
    ctx.lineWidth = Math.max(1.5, size * 0.08);
    ctx.beginPath();
    ctx.moveTo(nose.x, nose.y + size * 0.35);
    ctx.lineTo(nose.x, mouth.y + size * 0.35);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(nose.x, mouth.y + size * 0.35);
    ctx.quadraticCurveTo(nose.x - size * 0.55, mouth.y + size * 0.9, nose.x - size, mouth.y + size * 0.55);
    ctx.moveTo(nose.x, mouth.y + size * 0.35);
    ctx.quadraticCurveTo(nose.x + size * 0.55, mouth.y + size * 0.9, nose.x + size, mouth.y + size * 0.55);
    ctx.stroke();
    ctx.restore();
}

function drawWhiskers(ctx, nose, faceW, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, faceW * 0.012);
    [-1, 1].forEach(direction => {
        for (let i = 0; i < 3; i++) {
            const y = nose.y + faceW * (0.09 + i * 0.065);
            ctx.beginPath();
            ctx.moveTo(nose.x + direction * faceW * 0.1, y);
            ctx.lineTo(nose.x + direction * faceW * (0.47 + i * 0.035), y + (i - 1) * faceW * 0.09);
            ctx.stroke();
        }
    });
    ctx.restore();
}

function drawGlasses(ctx, leftEye, rightEye, size, neon) {
    const distance = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);
    const radius = size * (neon ? 1.22 : 1.05);
    ctx.save();
    ctx.strokeStyle = neon ? "#d5a0ff" : "#211b27";
    ctx.fillStyle = neon ? "rgba(168,90,255,.26)" : "rgba(30,25,36,.74)";
    ctx.shadowColor = neon ? "#f19bff" : "transparent";
    ctx.shadowBlur = neon ? size * 0.55 : 0;
    ctx.lineWidth = Math.max(2, size * 0.13);
    [leftEye, rightEye].forEach(eye => {
        ctx.beginPath();
        ctx.ellipse(eye.x, eye.y, radius, radius * 0.67, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    });
    ctx.beginPath();
    ctx.moveTo(leftEye.x + radius * 0.82, leftEye.y);
    ctx.lineTo(rightEye.x - radius * 0.82, rightEye.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(leftEye.x - radius, leftEye.y - radius * 0.05);
    ctx.lineTo(leftEye.x - radius * 1.3, leftEye.y - radius * 0.24);
    ctx.moveTo(rightEye.x + radius, rightEye.y - radius * 0.05);
    ctx.lineTo(rightEye.x + radius * 1.3, rightEye.y - radius * 0.24);
    ctx.stroke();
    ctx.restore();
}

function drawCheekGlow(ctx, left, right, faceW, kind) {
    const radius = faceW * 0.075;
    [left, right].forEach((cheek, index) => {
        const x = cheek.x + (index === 0 ? 1 : -1) * faceW * 0.13;
        const y = cheek.y + faceW * 0.12;
        if (kind === "freckles") {
            ctx.save();
            ctx.fillStyle = "#a8584b";
            for (let row = 0; row < 2; row++) {
                for (let col = 0; col < 4; col++) {
                    const dx = (col - 1.5) * faceW * 0.035;
                    const dy = (row - 0.5) * faceW * 0.045;
                    ctx.globalAlpha = 0.52 + ((col + row) % 2) * 0.2;
                    ctx.beginPath();
                    ctx.arc(x + dx, y + dy, faceW * 0.009, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            ctx.restore();
        } else {
            const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
            gradient.addColorStop(0, kind === "blush" ? "rgba(255,90,135,.5)" : "rgba(255,154,171,.43)");
            gradient.addColorStop(1, "rgba(255,120,160,0)");
            ctx.save();
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    });
}

function drawCrown(ctx, centerX, top, faceW, kind) {
    const width = faceW * 0.72;
    const height = faceW * 0.3;
    ctx.save();
    ctx.translate(centerX, top - height * 0.15);
    ctx.fillStyle = kind === "devil" ? "#ff5666" : "#ffd66e";
    ctx.strokeStyle = kind === "devil" ? "#a52b46" : "#d99632";
    ctx.lineWidth = Math.max(1.5, faceW * 0.012);
    ctx.beginPath();
    ctx.moveTo(-width / 2, 0);
    ctx.lineTo(-width * 0.44, -height * 0.65);
    ctx.lineTo(-width * 0.14, -height * 0.32);
    ctx.lineTo(0, -height);
    ctx.lineTo(width * 0.14, -height * 0.32);
    ctx.lineTo(width * 0.44, -height * 0.65);
    ctx.lineTo(width / 2, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (kind !== "devil") {
        ctx.fillStyle = "#ff6383";
        ctx.beginPath();
        ctx.arc(0, -height * 0.58, height * 0.08, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawHalo(ctx, centerX, top, faceW) {
    ctx.save();
    ctx.strokeStyle = "#ffe88a";
    ctx.shadowColor = "#fff5b8";
    ctx.shadowBlur = faceW * 0.08;
    ctx.lineWidth = Math.max(3, faceW * 0.035);
    ctx.beginPath();
    ctx.ellipse(centerX, top - faceW * 0.22, faceW * 0.22, faceW * 0.065, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

function drawFlowers(ctx, centerX, top, faceW) {
    const size = faceW * 0.17;
    for (let i = -2; i <= 2; i++) {
        drawEmoji(ctx, i % 2 ? "🌼" : "🌸", centerX + i * size * 0.77, top - size * (0.2 + (2 - Math.abs(i)) * 0.27), size);
    }
}

function drawSparkles(ctx, centerX, top, faceW, kind) {
    const color = kind === "starry" ? "#fff0a8" : kind === "fairy" ? "#d7b5ff" : "#fff8ce";
    [[-0.53, 0.35, 0.45], [0.53, 0.55, 0.35], [-0.42, -0.08, 0.28], [0.44, -0.12, 0.25]].forEach(([x, y, scale]) => {
        drawSparkleShape(ctx, centerX + faceW * x, top + faceW * y, faceW * scale * 0.09, color);
    });
}

function drawSparkleShape(ctx, x, y, size, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = size * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.quadraticCurveTo(x + size * 0.15, y - size * 0.15, x + size, y);
    ctx.quadraticCurveTo(x + size * 0.15, y + size * 0.15, x, y + size);
    ctx.quadraticCurveTo(x - size * 0.15, y + size * 0.15, x - size, y);
    ctx.quadraticCurveTo(x - size * 0.15, y - size * 0.15, x, y - size);
    ctx.fill();
    ctx.restore();
}

function drawRainbow(ctx, centerX, top, faceW) {
    ctx.save();
    ctx.lineWidth = Math.max(4, faceW * 0.035);
    const colors = ["#ff6f91", "#ffb66e", "#ffeb73", "#8de2a5", "#86c6ff", "#cba4ff"];
    colors.forEach((color, index) => {
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.arc(centerX, top - faceW * 0.05, faceW * (0.27 + index * 0.04), Math.PI * 1.12, Math.PI * 1.88);
        ctx.stroke();
    });
    ctx.restore();
}

function setMode(nextMode) {
    mode = nextMode === "video" ? "video" : "photo";
    document.querySelectorAll("[data-camera-mode]").forEach(button => {
        const selected = button.dataset.cameraMode === mode;
        button.classList.toggle("active", selected);
        button.setAttribute("aria-pressed", String(selected));
    });
    if (shutterLabel) shutterLabel.textContent = mode === "video" ? "Start video" : "Take photo";
    if (shutter) shutter.setAttribute("aria-label", mode === "video" ? "Start video recording" : "Take photo");
}

async function onShutter() {
    if (recorder && recorder.state === "recording") {
        recorder.stop();
        return;
    }
    if (mode === "photo") {
        const photo = await canvasToFile(canvas, `drop-${Date.now()}.jpg`, "image/jpeg", 0.92);
        if (!photo) {
            dispatch("drop:camera-error", { message: "Could not capture this photo. Try again." });
            return;
        }
        stopCameraStudio();
        dispatch("drop:camera-media", { photo, video: null });
        return;
    }
    await startRecording();
}

async function startRecording() {
    if (!canvas.captureStream || !window.MediaRecorder) {
        dispatch("drop:camera-error", { message: "Video recording is not supported by this browser." });
        return;
    }
    try {
        try {
            microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } catch {
            microphoneStream = null;
        }
        recordingStream = canvas.captureStream(24);
        microphoneStream?.getAudioTracks().forEach(track => recordingStream.addTrack(track));
        const mimeType = [
            "video/webm;codecs=vp9,opus",
            "video/webm;codecs=vp8,opus",
            "video/webm",
            "video/mp4"
        ].find(type => MediaRecorder.isTypeSupported?.(type));
        recorder = mimeType ? new MediaRecorder(recordingStream, { mimeType }) : new MediaRecorder(recordingStream);
        recordingChunks = [];
        cancellingRecording = false;
        recordStartedAt = Date.now();
        recorder.ondataavailable = event => {
            if (event.data?.size) recordingChunks.push(event.data);
        };
        recorder.onstop = finishRecording;
        recorder.start(500);
        shutter.classList.add("recording");
        shutterLabel.textContent = "Stop & use video";
        shutter.setAttribute("aria-label", "Stop video recording");
        timerEl.hidden = false;
        updateRecordTimer();
        timerInterval = window.setInterval(updateRecordTimer, 250);
        stopTimeout = window.setTimeout(() => {
            if (recorder?.state === "recording") recorder.stop();
        }, MAX_RECORDING_SECONDS * 1000);
    } catch (error) {
        cleanupRecording();
        dispatch("drop:camera-error", { message: error?.message || "Could not start video recording." });
    }
}

async function finishRecording() {
    const chunks = recordingChunks;
    const type = recorder?.mimeType || chunks[0]?.type || "video/webm";
    const cancelled = cancellingRecording;
    const videoBlob = new Blob(chunks, { type });
    const poster = cancelled ? null : await canvasToFile(canvas, `drop-poster-${Date.now()}.jpg`, "image/jpeg", 0.9);
    const extension = type.includes("mp4") ? "mp4" : "webm";
    const clip = !cancelled && videoBlob.size
        ? new File([videoBlob], `drop-${Date.now()}.${extension}`, { type })
        : null;
    cleanupRecording();
    if (cancelled) return;
    if (!clip || !poster) {
        dispatch("drop:camera-error", { message: "The recording did not save. Try a shorter clip." });
        return;
    }
    stopCameraStudio();
    dispatch("drop:camera-media", { photo: poster, video: clip });
}

function updateRecordTimer() {
    const seconds = Math.min(MAX_RECORDING_SECONDS, Math.floor((Date.now() - recordStartedAt) / 1000));
    const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
    const secs = String(seconds % 60).padStart(2, "0");
    timerEl.textContent = `● ${mins}:${secs}`;
    if (shutterLabel) shutterLabel.textContent = `Stop & use video · ${MAX_RECORDING_SECONDS - seconds}s`;
}

function cleanupRecording() {
    window.clearInterval(timerInterval);
    window.clearTimeout(stopTimeout);
    timerInterval = null;
    stopTimeout = null;
    recordingStream?.getTracks().forEach(track => track.stop());
    microphoneStream?.getTracks().forEach(track => track.stop());
    recordingStream = null;
    microphoneStream = null;
    recorder = null;
    recordingChunks = [];
    if (shutter) shutter.classList.remove("recording");
    if (timerEl) timerEl.hidden = true;
    if (shutterLabel) shutterLabel.textContent = mode === "video" ? "Start video" : "Take photo";
    if (shutter) shutter.setAttribute("aria-label", mode === "video" ? "Start video recording" : "Take photo");
}

function cleanupCamera() {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
    if (video) {
        video.pause();
        video.srcObject = null;
    }
    facePoints = [];
}

function canvasToFile(sourceCanvas, name, type, quality) {
    return new Promise(resolve => {
        sourceCanvas.toBlob(blob => {
            resolve(blob ? new File([blob], name, { type }) : null);
        }, type, quality);
    });
}

function setStatus(message) {
    if (statusEl) statusEl.textContent = message;
}

function dispatch(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
}

function onKeyDown(event) {
    if (event.key === "Escape" && panel && !panel.hidden) stopCameraStudio();
}
