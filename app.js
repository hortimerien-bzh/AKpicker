const colorPicker = document.getElementById("colorPicker");
const hexInput = document.getElementById("hexInput");
const randomButton = document.getElementById("randomButton");
const statusEl = document.getElementById("status");
const bestMatchCard = document.getElementById("bestMatch");
const suggestionsSection = document.getElementById("suggestions");
const bestName = document.getElementById("bestName");
const bestId = document.getElementById("bestId");
const bestHex = document.getElementById("bestHex");
const bestType = document.getElementById("bestType");
const bestLayer = document.getElementById("bestLayer");
const bestShade = document.getElementById("bestShade");
const bestHighlight = document.getElementById("bestHighlight");
const bestSwatch = document.getElementById("bestSwatch");
const bestLink = document.getElementById("bestLink");
const suggestionList = document.getElementById("suggestionList");
const imageInput = document.getElementById("imageInput");
const imageCanvas = document.getElementById("imageCanvas");
const canvasWrapper = document.getElementById("canvasWrapper");
const canvasContext = imageCanvas.getContext("2d");
const loupe = document.getElementById("loupe");
const loupeCanvas = document.getElementById("loupeCanvas");
const loupeColor = document.getElementById("loupeColor");
const loupeChip = document.getElementById("loupeChip");
const loupeCtx = loupeCanvas
  ? loupeCanvas.getContext("2d", { willReadFrequently: true })
  : null;

let akColours = [];
let currentImage = null;

const HEX_PATTERN = /^[0-9a-f]{6}$/i;
const MAX_CANVAS_WIDTH = 1100;
const MAX_CANVAS_HEIGHT = 700;
const LOUPE_PIXELS = 5;
const degToRad = (deg) => (deg * Math.PI) / 180;

if (loupeCanvas) {
  loupeCanvas.width = LOUPE_PIXELS;
  loupeCanvas.height = LOUPE_PIXELS;
}
if (loupeCtx) {
  loupeCtx.imageSmoothingEnabled = false;
}

const sanitizeHex = (value) => {
  if (!value) return null;
  const trimmed = value.trim();
  const stripped = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  const normalized = stripped.toUpperCase();
  if (HEX_PATTERN.test(normalized)) {
    return `#${normalized}`;
  }
  return null;
};

const hexToRgb = (hex) => {
  if (!hex) return null;
  const sanitized = sanitizeHex(hex);
  if (!sanitized) return null;
  const value = sanitized.slice(1);
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
};

const rgbToHex = (r, g, b) =>
  `#${[r, g, b]
    .map((component) => component.toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getCanvasCoordinates = (event) => {
  const rect = imageCanvas.getBoundingClientRect();
  const scaleX = imageCanvas.width / rect.width;
  const scaleY = imageCanvas.height / rect.height;
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY)) {
    return null;
  }
  const x = Math.floor((event.clientX - rect.left) * scaleX);
  const y = Math.floor((event.clientY - rect.top) * scaleY);
  if (
    Number.isNaN(x) ||
    Number.isNaN(y) ||
    x < 0 ||
    y < 0 ||
    x >= imageCanvas.width ||
    y >= imageCanvas.height
  ) {
    return null;
  }
  return { x, y };
};

const rgbToLab = ({ r, g, b }) => {
  const toLinear = (channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  const linearR = toLinear(r);
  const linearG = toLinear(g);
  const linearB = toLinear(b);

  const x =
    linearR * 0.4124564 + linearG * 0.3575761 + linearB * 0.1804375;
  const y =
    linearR * 0.2126729 + linearG * 0.7151522 + linearB * 0.072175;
  const z =
    linearR * 0.0193339 + linearG * 0.119192 + linearB * 0.9503041;

  const refX = 0.95047;
  const refY = 1.0;
  const refZ = 1.08883;

  const normalize = (value) =>
    value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;

  const fx = normalize(x / refX);
  const fy = normalize(y / refY);
  const fz = normalize(z / refZ);

  return {
    L: Math.max(0, 116 * fy - 16),
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
};

const hueAngle = (a, b) => {
  if (a === 0 && b === 0) return 0;
  const angle = (Math.atan2(b, a) * 180) / Math.PI;
  return angle >= 0 ? angle : angle + 360;
};

const deltaE2000 = (lab1, lab2) => {
  const Lbar = (lab1.L + lab2.L) / 2;
  const C1 = Math.hypot(lab1.a, lab1.b);
  const C2 = Math.hypot(lab2.a, lab2.b);
  const Cbar = (C1 + C2) / 2;

  const Cbar7 = Cbar ** 7;
  const gDenominator = Cbar7 + 25 ** 7;
  const gFactor =
    0.5 * (1 - Math.sqrt(gDenominator === 0 ? 0 : Cbar7 / gDenominator));

  const a1Prime = (1 + gFactor) * lab1.a;
  const a2Prime = (1 + gFactor) * lab2.a;
  const C1Prime = Math.hypot(a1Prime, lab1.b);
  const C2Prime = Math.hypot(a2Prime, lab2.b);
  const CbarPrime = (C1Prime + C2Prime) / 2;

  const h1Prime = hueAngle(a1Prime, lab1.b);
  const h2Prime = hueAngle(a2Prime, lab2.b);

  const deltaLPrime = lab2.L - lab1.L;
  const deltaCPrime = C2Prime - C1Prime;

  let deltahPrime = 0;
  if (C1Prime * C2Prime !== 0) {
    let diff = h2Prime - h1Prime;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    deltahPrime = diff;
  }

  const deltaHPrime =
    2 *
    Math.sqrt(C1Prime * C2Prime) *
    Math.sin(degToRad(deltahPrime) / 2);

  const hBarPrime = (() => {
    if (C1Prime * C2Prime === 0) return h1Prime + h2Prime;
    if (Math.abs(h1Prime - h2Prime) <= 180)
      return (h1Prime + h2Prime) / 2;
    return (h1Prime + h2Prime + (h1Prime + h2Prime < 360 ? 360 : -360)) / 2;
  })();

  const T =
    1 -
    0.17 * Math.cos(degToRad(hBarPrime - 30)) +
    0.24 * Math.cos(degToRad(2 * hBarPrime)) +
    0.32 * Math.cos(degToRad(3 * hBarPrime + 6)) -
    0.2 * Math.cos(degToRad(4 * hBarPrime - 63));

  const deltaTheta =
    30 * Math.exp(-(((hBarPrime - 275) / 25) ** 2));
  const RcDenominator = CbarPrime ** 7 + 25 ** 7;
  const RC =
    RcDenominator === 0
      ? 0
      : 2 * Math.sqrt((CbarPrime ** 7) / RcDenominator);
  const SL =
    1 + (0.015 * (Lbar - 50) ** 2) / Math.sqrt(20 + (Lbar - 50) ** 2);
  const SC = 1 + 0.045 * CbarPrime;
  const SH = 1 + 0.015 * CbarPrime * T;
  const RT = -Math.sin(degToRad(2 * deltaTheta)) * RC;

  return Math.sqrt(
    (deltaLPrime / SL) ** 2 +
      (deltaCPrime / SC) ** 2 +
      (deltaHPrime / SH) ** 2 +
      RT * (deltaCPrime / SC) * (deltaHPrime / SH)
  );
};

const hexToLab = (hex) => {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToLab(rgb) : null;
};

const setStatus = (message, variant = "info") => {
  statusEl.textContent = message;
  statusEl.classList.remove("error", "success");
  if (variant === "error") {
    statusEl.classList.add("error");
  } else if (variant === "success") {
    statusEl.classList.add("success");
  }
};

const formatFallback = (value) => value || "—";

const hideLoupe = () => {
  if (!loupe) return;
  loupe.classList.add("hidden");
  loupe.style.transform = "translate(-9999px, -9999px)";
};

const positionLoupe = (clientX, clientY) => {
  if (!loupe) return;
  loupe.classList.remove("hidden");
  const wrapperRect = canvasWrapper.getBoundingClientRect();
  const loupeRect = loupe.getBoundingClientRect();
  const offset = 18;
  const maxLeft = Math.max(wrapperRect.width - loupeRect.width - 8, 0);
  const maxTop = Math.max(wrapperRect.height - loupeRect.height - 8, 0);
  let left = clientX - wrapperRect.left + offset;
  let top = clientY - wrapperRect.top + offset;
  left = clamp(left, 8, maxLeft);
  top = clamp(top, 8, maxTop);
  loupe.style.transform = `translate(${left}px, ${top}px)`;
};

const updateLoupePreview = (event) => {
  if (
    !loupeCtx ||
    canvasWrapper.classList.contains("empty")
  ) {
    hideLoupe();
    return;
  }
  const coords = getCanvasCoordinates(event);
  if (!coords) {
    hideLoupe();
    return;
  }

  const viewSize = Math.min(
    LOUPE_PIXELS,
    imageCanvas.width,
    imageCanvas.height
  );
  if (!viewSize) {
    hideLoupe();
    return;
  }
  const half = Math.floor(viewSize / 2);
  const maxX = Math.max(imageCanvas.width - viewSize, 0);
  const maxY = Math.max(imageCanvas.height - viewSize, 0);
  const startX = clamp(coords.x - half, 0, maxX);
  const startY = clamp(coords.y - half, 0, maxY);

  if (loupeCanvas) {
    loupeCanvas.width = viewSize;
    loupeCanvas.height = viewSize;
  }

  const sample = canvasContext.getImageData(
    startX,
    startY,
    viewSize,
    viewSize
  );
  loupeCtx.putImageData(sample, 0, 0);

  const centerOffset = Math.floor(viewSize / 2);
  const index = (centerOffset * viewSize + centerOffset) * 4;
  const r = sample.data[index] ?? 0;
  const g = sample.data[index + 1] ?? 0;
  const b = sample.data[index + 2] ?? 0;
  const hex = rgbToHex(r, g, b);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (loupeColor) {
    loupeColor.textContent = hex;
    loupeColor.style.background = hex;
    loupeColor.style.color = luminance > 0.6 ? "#04111f" : "#f8fafc";
  }
  if (loupeChip) {
    loupeChip.style.background = hex;
    loupeChip.style.borderColor =
      luminance > 0.6 ? "rgba(0, 0, 0, 0.3)" : "rgba(255, 255, 255, 0.4)";
  }

  positionLoupe(event.clientX, event.clientY);
};

const resetCanvas = () => {
  canvasWrapper.classList.add("empty");
  if (imageCanvas.width && imageCanvas.height) {
    canvasContext.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
  }
  imageCanvas.width = 0;
  imageCanvas.height = 0;
  currentImage = null;
  hideLoupe();
};

const drawImageToCanvas = (img) => {
  const ratio = img.naturalWidth / img.naturalHeight || 1;
  let width = img.naturalWidth;
  let height = img.naturalHeight;

  if (width > MAX_CANVAS_WIDTH) {
    width = MAX_CANVAS_WIDTH;
    height = width / ratio;
  }
  if (height > MAX_CANVAS_HEIGHT) {
    height = MAX_CANVAS_HEIGHT;
    width = height * ratio;
  }

  imageCanvas.width = Math.max(1, Math.round(width));
  imageCanvas.height = Math.max(1, Math.round(height));
  canvasContext.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
  canvasContext.drawImage(img, 0, 0, imageCanvas.width, imageCanvas.height);
  canvasWrapper.classList.remove("empty");
  currentImage = img;
};

const renderMatchCard = (match) => {
  if (!match) {
    bestMatchCard.classList.add("hidden");
    return;
  }
  bestMatchCard.classList.remove("hidden");
  bestSwatch.style.background = match.Value;
  bestName.textContent = match.Name;
  const typeLabel = match.Type ? ` • ${match.Type}` : "";
  const deltaLabel =
    typeof match.distance === "number"
      ? ` • ΔE ${match.distance.toFixed(2)}`
      : "";
  bestId.textContent = `${match.Id}${typeLabel}${deltaLabel}`;
  bestHex.textContent = match.Value;
  bestType.textContent = formatFallback(match.Type);
  bestLayer.textContent = formatFallback(match.Layer);
  bestShade.textContent = formatFallback(match.Shade);
  bestHighlight.textContent = formatFallback(match.Highlight);
  bestLink.href = match.Url || "#";
  bestLink.classList.toggle("hidden", !match.Url);
};

const renderSuggestions = (suggestions) => {
  suggestionList.innerHTML = "";
  if (!suggestions || !suggestions.length) {
    suggestionsSection.classList.add("hidden");
    return;
  }
  suggestionsSection.classList.remove("hidden");
  const fragment = document.createDocumentFragment();

  suggestions.forEach((entry) => {
    const card = document.createElement("article");
    card.className = "suggestion";

    const swatch = document.createElement("div");
    swatch.className = "mini-swatch";
    swatch.style.background = entry.Value;

    const title = document.createElement("h4");
    title.textContent = entry.Name;

    const meta = document.createElement("p");
    meta.textContent = `${entry.Id} • ${entry.Value}`;

    const delta = document.createElement("p");
    delta.className = "muted";
    delta.textContent = `ΔE ${entry.distance.toFixed(2)}`;

    card.appendChild(swatch);
    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(delta);
    fragment.appendChild(card);
  });

  suggestionList.appendChild(fragment);
};

const findClosestMatches = (hexValue, limit = 5) => {
  const target = hexToLab(hexValue);
  if (!target) return [];

  return akColours
    .map((colour) => ({
      ...colour,
      distance: deltaE2000(target, colour.lab),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
};

const renderMatches = (hexValue) => {
  const matches = findClosestMatches(hexValue, 5);
  if (!matches.length) {
    setStatus("Enter a valid hex value (e.g. #FF6600).", "error");
    renderMatchCard(null);
    renderSuggestions([]);
    return;
  }

  renderMatchCard(matches[0]);
  renderSuggestions(matches.slice(1));
  setStatus(
    `Showing closest AK matches for ${hexValue.toUpperCase()}`,
    "success"
  );
};

const handlePickerChange = (event) => {
  const value = event.target.value.toUpperCase();
  hexInput.value = value;
  renderMatches(value);
};

const handleHexInput = (event) => {
  const sanitized = sanitizeHex(event.target.value);
  if (sanitized) {
    colorPicker.value = sanitized;
    renderMatches(sanitized);
  }
};

const handleImageUpload = (event) => {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }
  if (!file.type.startsWith("image/")) {
    setStatus("Please upload an image file (png, jpg, webp…).", "error");
    return;
  }

  const imageUrl = URL.createObjectURL(file);
  const image = new Image();

  image.onload = () => {
    drawImageToCanvas(image);
    setStatus(
      "Image loaded. Click anywhere on the picture to sample a colour."
    );
    URL.revokeObjectURL(imageUrl);
  };

  image.onerror = () => {
    resetCanvas();
    setStatus("Unable to read that image. Try a different file.", "error");
    URL.revokeObjectURL(imageUrl);
  };

  image.src = imageUrl;
};

const sampleColourFromCanvas = (event) => {
  if (canvasWrapper.classList.contains("empty")) {
    return;
  }
  const coords = getCanvasCoordinates(event);
  if (!coords) {
    return;
  }

  const [r, g, b, alpha] = canvasContext
    .getImageData(coords.x, coords.y, 1, 1)
    .data;
  if (alpha === 0) {
    return;
  }
  const hex = rgbToHex(r, g, b);
  colorPicker.value = hex;
  hexInput.value = hex;
  renderMatches(hex);
};

const pickRandomColour = () => {
  if (!akColours.length) return;
  const randomColour =
    akColours[Math.floor(Math.random() * akColours.length)];
  colorPicker.value = randomColour.Value;
  hexInput.value = randomColour.Value;
  renderMatches(randomColour.Value);
};

const loadPalette = async () => {
  try {
    const response = await fetch("data/ak_interactive_colors.json", {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const rawColours = await response.json();
    akColours = rawColours
      .filter((colour) => typeof colour.Value === "string")
      .map((colour) => {
        const normalized = colour.Value.toUpperCase();
        const rgb = hexToRgb(normalized);
        const lab = rgb ? rgbToLab(rgb) : null;
        return {
          ...colour,
          Value: normalized,
          rgb,
          lab,
        };
      })
      .filter((colour) => Boolean(colour.rgb && colour.lab));

    if (!akColours.length) {
      throw new Error("No valid colours were loaded.");
    }

    setStatus(
      `Loaded ${akColours.length} AK Interactive shades. Pick a colour to start.`
    );
    renderMatches(colorPicker.value);
  } catch (error) {
    console.error(error);
    setStatus(
      `Unable to load the AK palette. ${error.message}`,
      "error"
    );
  }
};

const init = () => {
  colorPicker.addEventListener("input", handlePickerChange);
  hexInput.addEventListener("input", handleHexInput);
  randomButton.addEventListener("click", pickRandomColour);
  imageInput.addEventListener("change", handleImageUpload);
  imageCanvas.addEventListener("click", sampleColourFromCanvas);
  imageCanvas.addEventListener("mousemove", updateLoupePreview);
  imageCanvas.addEventListener("mouseenter", updateLoupePreview);
  imageCanvas.addEventListener("mouseleave", hideLoupe);
  loadPalette();
};

document.addEventListener("DOMContentLoaded", init);
