"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type PalmScanAnimationProps = {
  imageUrl: string;
  isComplete: boolean;
  status?: string;
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

const lineStageIds: ScanStageId[] = ["life", "head", "heart", "fate"];

export default function PalmScanAnimation({
  imageUrl,
  isComplete,
  status = "Analysing your palm",
  onAnimationFinished,
}: PalmScanAnimationProps) {
  const [stageIndex, setStageIndex] = useState(0);
  const [isSequenceComplete, setIsSequenceComplete] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const hasFinishedRef = useRef(false);

  const activeStage = scanStages[Math.min(stageIndex, scanStages.length - 1)];
  const completedLineIds = useMemo(
    () =>
      scanStages
        .slice(0, stageIndex)
        .map((stage) => stage.id)
        .filter((id) => lineStageIds.includes(id)),
    [stageIndex]
  );

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

  function pathClass(id: ScanStageId) {
    return [
      "palm-path",
      `${id}-line`,
      activeStage.id === id ? "is-active" : "",
      completedLineIds.includes(id) || isFinishing ? "is-complete" : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  function markerClass(id: ScanStageId) {
    return ["palm-marker", activeStage.id === id ? "is-visible" : ""]
      .filter(Boolean)
      .join(" ");
  }

  return (
    <div className={`palm-scan-screen ${isFinishing ? "is-finishing" : ""}`}>
      <div className="palm-scan-card">
        <div className="palm-scan-image-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Palm being analysed"
            className="palm-scan-image"
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

          <svg
            className="palm-line-overlay"
            viewBox="0 0 320 420"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              className={pathClass("life")}
              d="M220 145 C270 185 260 300 190 355"
            />
            <path
              className={pathClass("head")}
              d="M95 205 C150 180 215 200 260 235"
            />
            <path
              className={pathClass("heart")}
              d="M80 160 C145 120 220 135 275 175"
            />
            <path
              className={pathClass("fate")}
              d="M170 360 C165 300 170 225 160 155"
            />

            <g className={markerClass("life")}>
              <circle cx="220" cy="230" r="7" />
              <line x1="227" y1="230" x2="285" y2="230" />
            </g>
            <g className={markerClass("head")}>
              <circle cx="170" cy="205" r="7" />
              <line x1="177" y1="205" x2="286" y2="205" />
            </g>
            <g className={markerClass("heart")}>
              <circle cx="178" cy="151" r="7" />
              <line x1="185" y1="151" x2="286" y2="151" />
            </g>
            <g className={markerClass("fate")}>
              <circle cx="167" cy="258" r="7" />
              <line x1="174" y1="258" x2="286" y2="258" />
            </g>
          </svg>

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
          <p>{activeStage.description}</p>

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
