"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  PalmLineKey,
  PalmLinePoint,
  PalmVisualLine,
  PalmVisualMap,
} from "@/lib/palmistry/visualMap";

type PalmScanAnimationProps = {
  imageUrl: string;
  isComplete: boolean;
  status?: string;
  visualMap?: PalmVisualMap | null;
  onAnimationFinished?: () => void;
};

const scanStages = [
  {
    id: "position",
    title: "Mapping your palm",
    description: "Checking the palm shape, finger position and overall clarity.",
    duration: 1400,
  },
  {
    id: "life",
    title: "Life Line",
    description:
      "Often associated with vitality, grounding and major life transitions.",
    duration: 1700,
  },
  {
    id: "head",
    title: "Head Line",
    description:
      "Traditionally linked with thinking style, focus and decision-making.",
    duration: 1700,
  },
  {
    id: "heart",
    title: "Heart Line",
    description:
      "Traditionally associated with emotional expression and relationships.",
    duration: 1700,
  },
  {
    id: "fate",
    title: "Fate Line",
    description:
      "When visible, it is traditionally read for direction, work and responsibility.",
    duration: 1700,
  },
  {
    id: "mounts",
    title: "Palm Mounts",
    description:
      "Reviewing the raised areas traditionally associated with temperament and strengths.",
    duration: 1500,
  },
  {
    id: "final",
    title: "Preparing your reading",
    description:
      "Combining the visible palm features into your personalised guidance.",
    duration: 1200,
  },
] as const;

type ScanStageId = (typeof scanStages)[number]["id"];

type ImageBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const lineStageIds: ScanStageId[] = ["life", "head", "heart", "fate"];
const stageLineMap: Partial<Record<ScanStageId, PalmLineKey>> = {
  life: "lifeLine",
  head: "headLine",
  heart: "heartLine",
  fate: "fateLine",
};
const lineLabels: Record<PalmLineKey, string> = {
  lifeLine: "LIFE LINE",
  headLine: "HEAD LINE",
  heartLine: "HEART LINE",
  fateLine: "FATE LINE",
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getVisibleLine(line: PalmVisualLine | undefined) {
  return line && line.visible && line.confidence >= 0.5 && line.points.length >= 3
    ? line
    : null;
}

function pointToCanvas(point: PalmLinePoint) {
  return {
    x: point.x * 1000,
    y: point.y * 1000,
  };
}

function pointsToPath(points: PalmLinePoint[]) {
  const canvasPoints = points.map(pointToCanvas);

  if (canvasPoints.length < 2) return "";

  const [firstPoint] = canvasPoints;
  const commands = [`M ${firstPoint.x.toFixed(1)} ${firstPoint.y.toFixed(1)}`];

  for (let index = 0; index < canvasPoints.length - 1; index += 1) {
    const p0 = canvasPoints[Math.max(0, index - 1)];
    const p1 = canvasPoints[index];
    const p2 = canvasPoints[index + 1];
    const p3 = canvasPoints[Math.min(canvasPoints.length - 1, index + 2)];
    const cp1 = {
      x: p1.x + (p2.x - p0.x) / 6,
      y: p1.y + (p2.y - p0.y) / 6,
    };
    const cp2 = {
      x: p2.x - (p3.x - p1.x) / 6,
      y: p2.y - (p3.y - p1.y) / 6,
    };

    commands.push(
      `C ${cp1.x.toFixed(1)} ${cp1.y.toFixed(1)}, ${cp2.x.toFixed(
        1
      )} ${cp2.y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
    );
  }

  return commands.join(" ");
}

function getLabelPosition(points: PalmLinePoint[]) {
  const midpoint = pointToCanvas(points[Math.floor(points.length / 2)]);

  return {
    x: clamp(midpoint.x, 110, 890),
    y: clamp(midpoint.y + 42, 42, 958),
  };
}

export default function PalmScanAnimation({
  imageUrl,
  isComplete,
  status = "Analysing your palm",
  visualMap,
  onAnimationFinished,
}: PalmScanAnimationProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [stageIndex, setStageIndex] = useState(0);
  const [isSequenceComplete, setIsSequenceComplete] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [imageBox, setImageBox] = useState<ImageBox | null>(null);
  const hasFinishedRef = useRef(false);

  const activeStage = scanStages[Math.min(stageIndex, scanStages.length - 1)];
  const activeLineKey = stageLineMap[activeStage.id];
  const activeLine = activeLineKey
    ? getVisibleLine(visualMap?.lines[activeLineKey])
    : null;
  const completedLineIds = useMemo(
    () =>
      scanStages
        .slice(0, stageIndex)
        .map((stage) => stage.id)
        .filter((id) => lineStageIds.includes(id)),
    [stageIndex]
  );
  const lineEntries = useMemo(
    () =>
      (Object.entries(lineLabels) as [PalmLineKey, string][])
        .map(([lineKey, label]) => {
          const line = getVisibleLine(visualMap?.lines[lineKey]);

          if (!line) return null;

          return {
            lineKey,
            label,
            line,
            path: pointsToPath(line.points),
            labelPosition: getLabelPosition(line.points),
          };
        })
        .filter(Boolean) as Array<{
        lineKey: PalmLineKey;
        label: string;
        line: PalmVisualLine;
        path: string;
        labelPosition: { x: number; y: number };
      }>,
    [visualMap]
  );
  const hasAnyMappedLine = lineEntries.length > 0;

  useEffect(() => {
    if (stageIndex >= scanStages.length - 1) {
      const timeout = window.setTimeout(() => {
        setIsSequenceComplete(true);
      }, activeStage.duration);

      return () => window.clearTimeout(timeout);
    }

    const timeout = window.setTimeout(() => {
      setStageIndex((current) => Math.min(current + 1, scanStages.length - 1));
    }, activeStage.duration);

    return () => window.clearTimeout(timeout);
  }, [activeStage.duration, stageIndex]);

  useEffect(() => {
    if (!isComplete || !isSequenceComplete || hasFinishedRef.current) return;

    hasFinishedRef.current = true;
    setIsFinishing(true);

    const timeout = window.setTimeout(() => {
      onAnimationFinished?.();
    }, 650);

    return () => window.clearTimeout(timeout);
  }, [isComplete, isSequenceComplete, onAnimationFinished]);

  useEffect(() => {
    function updateImageBox() {
      const wrap = wrapRef.current;
      const image = imageRef.current;

      if (!wrap || !image || !image.naturalWidth || !image.naturalHeight) {
        return;
      }

      const wrapRect = wrap.getBoundingClientRect();
      const scale = Math.min(
        wrapRect.width / image.naturalWidth,
        wrapRect.height / image.naturalHeight
      );
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;

      setImageBox({
        left: (wrapRect.width - width) / 2,
        top: (wrapRect.height - height) / 2,
        width,
        height,
      });
    }

    updateImageBox();

    const wrap = wrapRef.current;
    const observer =
      typeof ResizeObserver !== "undefined" && wrap
        ? new ResizeObserver(updateImageBox)
        : null;

    if (observer && wrap) {
      observer.observe(wrap);
    }
    window.addEventListener("resize", updateImageBox);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateImageBox);
    };
  }, [imageUrl]);

  function pathClass(lineKey: PalmLineKey) {
    const stageId = Object.entries(stageLineMap).find(
      ([, mappedLineKey]) => mappedLineKey === lineKey
    )?.[0] as ScanStageId | undefined;

    return [
      "palm-path",
      activeLineKey === lineKey ? "is-active" : "",
      (stageId && completedLineIds.includes(stageId)) || isFinishing
        ? "is-complete"
        : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  function labelClass(lineKey: PalmLineKey) {
    return [
      "palm-line-label",
      activeLineKey === lineKey ? "is-active" : "",
      pathClass(lineKey).includes("is-complete") ? "is-complete" : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  function getStageDescription() {
    if (!activeLineKey) return activeStage.description;
    if (!visualMap) return "Waiting for image-specific line mapping.";
    if (!activeLine) {
      return `${activeStage.title} is not clearly visible in the current photo.`;
    }

    return activeStage.description;
  }

  return (
    <div className={`palm-scan-screen ${isFinishing ? "is-finishing" : ""}`}>
      <div className="palm-scan-card">
        <div ref={wrapRef} className="palm-scan-image-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imageRef}
            src={imageUrl}
            alt="Palm being analysed"
            className="palm-scan-image"
            onLoad={() => {
              const wrap = wrapRef.current;
              const image = imageRef.current;

              if (!wrap || !image || !image.naturalWidth) return;

              const wrapRect = wrap.getBoundingClientRect();
              const scale = Math.min(
                wrapRect.width / image.naturalWidth,
                wrapRect.height / image.naturalHeight
              );

              setImageBox({
                left: (wrapRect.width - image.naturalWidth * scale) / 2,
                top: (wrapRect.height - image.naturalHeight * scale) / 2,
                width: image.naturalWidth * scale,
                height: image.naturalHeight * scale,
              });
            }}
          />

          <div className="palm-scan-dark-overlay" />
          <div className="palm-scan-grid" />

          <div
            className={`palm-scanner-line ${
              activeStage.id === "final" ? "is-final" : ""
            }`}
          >
            <div className="palm-scanner-glow" />
          </div>

          {imageBox && hasAnyMappedLine && (
            <svg
              className="palm-line-overlay"
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              aria-hidden="true"
              style={{
                left: imageBox.left,
                top: imageBox.top,
                width: imageBox.width,
                height: imageBox.height,
              }}
            >
              {lineEntries.map(({ lineKey, path }) => (
                <path key={lineKey} className={pathClass(lineKey)} d={path} />
              ))}

              {lineEntries.map(({ lineKey, label, labelPosition }) => {
                const labelWidth = Math.min(190, label.length * 9 + 34);

                return (
                  <g
                    key={`${lineKey}-label`}
                    className={labelClass(lineKey)}
                    transform={`translate(${labelPosition.x} ${labelPosition.y})`}
                  >
                    <rect
                      className="palm-line-label-bg"
                      x={-labelWidth / 2}
                      y={-18}
                      width={labelWidth}
                      height={28}
                      rx={14}
                    />
                    <text textAnchor="middle" dominantBaseline="middle">
                      {label}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}

          <div className="palm-scan-corners" aria-hidden="true">
            <div className="palm-corner palm-corner-tl" />
            <div className="palm-corner palm-corner-tr" />
            <div className="palm-corner palm-corner-bl" />
            <div className="palm-corner palm-corner-br" />
          </div>
        </div>

        <div className="palm-scan-info" aria-live="polite">
          <p className="palm-scan-status">{status}</p>
          <h2>{activeStage.title}</h2>
          <p>{getStageDescription()}</p>

          <div className="palm-scan-stage-dots" aria-hidden="true">
            {scanStages.map((stage, index) => (
              <span
                key={stage.id}
                className={
                  index <= stageIndex || isFinishing ? "is-active" : ""
                }
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
