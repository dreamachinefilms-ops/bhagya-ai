export type PalmLineKey = "lifeLine" | "headLine" | "heartLine" | "fateLine";

export type PalmLinePoint = {
  x: number;
  y: number;
};

export type PalmVisualLine = {
  visible: boolean;
  confidence: number;
  points: PalmLinePoint[];
};

export type PalmVisualMap = {
  imageWidth?: number;
  imageHeight?: number;
  handOrientation?: "left_palm" | "right_palm" | "unknown";
  quality: {
    usable: boolean;
    issues: string[];
    handDetected: boolean;
    palmFacingCamera: boolean;
  };
  lines: Record<PalmLineKey, PalmVisualLine>;
};

const lineKeys: PalmLineKey[] = [
  "lifeLine",
  "headLine",
  "heartLine",
  "fateLine",
];

const emptyLine: PalmVisualLine = {
  visible: false,
  confidence: 0,
  points: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function parseJsonObject(text: string) {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return JSON.parse(cleaned) as unknown;
}

function sanitizePoints(points: unknown) {
  if (!Array.isArray(points)) return [];

  const cleanPoints: PalmLinePoint[] = [];

  for (const point of points.slice(0, 14)) {
    if (!isRecord(point)) continue;

    const x = typeof point.x === "number" ? point.x : Number.NaN;
    const y = typeof point.y === "number" ? point.y : Number.NaN;

    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < 0 || x > 1 || y < 0 || y > 1) continue;

    const previous = cleanPoints[cleanPoints.length - 1];

    if (previous) {
      const distance = Math.hypot(previous.x - x, previous.y - y);

      if (distance > 0.55) continue;
    }

    cleanPoints.push({ x: clamp01(x), y: clamp01(y) });
  }

  return cleanPoints.slice(0, 10);
}

function sanitizeLine(value: unknown): PalmVisualLine {
  if (!isRecord(value)) return emptyLine;

  const confidence =
    typeof value.confidence === "number" && Number.isFinite(value.confidence)
      ? clamp01(value.confidence)
      : 0;
  const points = sanitizePoints(value.points);
  const visible = value.visible === true && confidence >= 0.5 && points.length >= 3;

  return visible
    ? {
        visible,
        confidence,
        points,
      }
    : {
        visible: false,
        confidence,
        points: [],
      };
}

export function sanitizePalmVisualMap(value: unknown): PalmVisualMap {
  if (!isRecord(value)) {
    throw new Error("Invalid palm visual map.");
  }

  const quality = isRecord(value.quality) ? value.quality : {};
  const lines = isRecord(value.lines) ? value.lines : {};
  const sanitizedLines = lineKeys.reduce(
    (acc, key) => ({
      ...acc,
      [key]: sanitizeLine(lines[key]),
    }),
    {} as Record<PalmLineKey, PalmVisualLine>
  );

  return {
    imageWidth:
      typeof value.imageWidth === "number" && Number.isFinite(value.imageWidth)
        ? Math.max(1, Math.round(value.imageWidth))
        : undefined,
    imageHeight:
      typeof value.imageHeight === "number" && Number.isFinite(value.imageHeight)
        ? Math.max(1, Math.round(value.imageHeight))
        : undefined,
    handOrientation:
      value.handOrientation === "left_palm" ||
      value.handOrientation === "right_palm"
        ? value.handOrientation
        : "unknown",
    quality: {
      usable: quality.usable !== false,
      issues: Array.isArray(quality.issues)
        ? quality.issues
            .filter((issue): issue is string => typeof issue === "string")
            .slice(0, 5)
        : [],
      handDetected: quality.handDetected !== false,
      palmFacingCamera: quality.palmFacingCamera !== false,
    },
    lines: sanitizedLines,
  };
}

export function parsePalmVisualMapJson(text: string) {
  return sanitizePalmVisualMap(parseJsonObject(text));
}

export function buildPalmVisualMapPrompt() {
  return `
You are Bhagya's palm-line visual mapper. Inspect the uploaded palm image only for visible crease geometry.

Return valid JSON only. Do not include markdown.

Rules:
* Identify only visible palm creases. Do not invent hidden lines.
* Distinguish anatomical palm creases from shadows, finger boundaries, jewelry, nails, and background objects.
* Account for left or right hand orientation without mirroring coordinates.
* Coordinates must be normalized between 0 and 1 relative to the correctly oriented image: x from left to right, y from top to bottom.
* Use enough points for a natural curve, usually 4 to 8 points.
* If a line is unclear, set visible false, use low confidence, and return an empty points array.
* Report low confidence when lighting, blur, crop, or obstruction makes mapping uncertain.
* Do not block imperfect images unless the palm cannot be mapped at all.

Return this exact JSON shape:
{
  "imageWidth": 0,
  "imageHeight": 0,
  "handOrientation": "left_palm | right_palm | unknown",
  "quality": {
    "usable": true,
    "issues": [],
    "handDetected": true,
    "palmFacingCamera": true
  },
  "lines": {
    "lifeLine": { "visible": false, "confidence": 0, "points": [] },
    "headLine": { "visible": false, "confidence": 0, "points": [] },
    "heartLine": { "visible": false, "confidence": 0, "points": [] },
    "fateLine": { "visible": false, "confidence": 0, "points": [] }
  }
}
  `;
}
