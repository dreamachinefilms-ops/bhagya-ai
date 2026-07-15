"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";

export type UploadedImage = {
  file: File;
  dataUrl: string;
  previewUrl: string;
  name: string;
  size: number;
  mimeType: string;
  storagePath?: string;
};

type ImageUploaderProps = {
  mode?: "palmistry" | "generic";
  accept?: string;
  maxSize?: number;
  allowCamera?: boolean;
  value?: UploadedImage | null;
  onChange: (image: UploadedImage | null) => void;
  onAnalyze?: (image: UploadedImage) => void;
  isAnalyzing?: boolean;
  disabled?: boolean;
};

const acceptedMimeTypes = ["image/jpeg", "image/png", "image/webp"];
const emptyFileMessage = "Please upload a non-empty image file.";

function formatFileSize(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(bytes > 1024 * 1024 ? 1 : 2)}MB`;
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Could not read image."));
    reader.onerror = () => reject(new Error("Could not read image."));
    reader.readAsDataURL(file);
  });
}

export default function ImageUploader({
  mode = "generic",
  accept = "image/*",
  maxSize = 15,
  allowCamera = false,
  value,
  onChange,
  onAnalyze,
  isAnalyzing = false,
  disabled = false,
}: ImageUploaderProps) {
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const maxBytes = maxSize * 1024 * 1024;
  const isPalmistry = mode === "palmistry";

  async function handleFile(file: File | undefined) {
    if (!file || disabled || isAnalyzing) return;

    setError("");

    if (file.size <= 0) {
      setError(emptyFileMessage);
      return;
    }

    if (!acceptedMimeTypes.includes(file.type)) {
      setError("Please upload a JPG, PNG or WEBP image.");
      return;
    }

    if (file.size > maxBytes) {
      setError(`Please upload an image smaller than ${maxSize} MB.`);
      return;
    }

    try {
      const dataUrl = await readAsDataUrl(file);
      onChange({
        file,
        dataUrl,
        previewUrl: dataUrl,
        name: file.name || "Palm photo",
        size: file.size,
        mimeType: file.type,
      });
    } catch {
      setError("Could not read this image. Please try another photo.");
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function openGallery() {
    galleryInputRef.current?.click();
  }

  function openCamera() {
    cameraInputRef.current?.click();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    void handleFile(event.dataTransfer.files?.[0]);
  }

  function handleAnalyze() {
    if (value && onAnalyze && !disabled && !isAnalyzing) {
      onAnalyze(value);
    }
  }

  const title = isPalmistry ? "Upload Your Palm" : "Upload Image";
  const subtitle = isPalmistry
    ? "Upload a clear photo of your dominant hand for a personalised palm reading."
    : "Upload a clear image to continue.";

  return (
    <div className="w-full">
      <input
        ref={galleryInputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleInputChange}
      />
      {allowCamera && (
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleInputChange}
        />
      )}

      <div
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`group relative mx-auto overflow-hidden rounded-[24px] border p-4 transition-all duration-300 sm:p-6 ${
          isDragging
            ? "scale-[1.01] border-sky-300/70"
            : "border-white/[0.10] hover:border-sky-300/35"
        }`}
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.045))",
          boxShadow: isDragging
            ? "0 0 42px rgba(56,189,248,0.32)"
            : "0 18px 60px rgba(0,0,0,0.38), 0 0 36px rgba(56,189,248,0.12)",
          backdropFilter: "blur(22px)",
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(circle at 50% 0%, rgba(56,189,248,0.18), transparent 48%)",
          }}
        />

        {value ? (
          <div className="relative z-10">
            <div className="overflow-hidden rounded-[18px] border border-white/[0.10] bg-black/25">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={value.previewUrl}
                alt={isPalmistry ? "Selected palm photo" : "Selected image"}
                className="h-[260px] w-full object-cover sm:h-[310px]"
              />
            </div>

            <div className="mt-4 flex items-start justify-between gap-3">
              <div className="min-w-0 text-left">
                <p className="truncate text-[14px] font-semibold text-white/90">
                  {value.name}
                </p>
                <p className="mt-0.5 text-[12px] text-white/42">
                  {formatFileSize(value.size)} selected
                </p>
              </div>

              <button
                type="button"
                onClick={() => onChange(null)}
                disabled={disabled || isAnalyzing}
                className="rounded-full border border-white/[0.10] px-3 py-1.5 text-[12px] font-medium text-white/55 transition hover:border-red-300/40 hover:bg-red-400/10 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Remove Image
              </button>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1.2fr]">
              <button
                type="button"
                onClick={openGallery}
                disabled={disabled || isAnalyzing}
                className="min-h-12 rounded-2xl border border-white/[0.10] bg-white/[0.05] px-4 text-[14px] font-semibold text-white/70 transition hover:border-sky-300/35 hover:bg-sky-400/10 hover:text-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Replace Image
              </button>

              <button
                type="button"
                onClick={handleAnalyze}
                disabled={!value || disabled || isAnalyzing}
                className="min-h-12 rounded-2xl px-4 text-[15px] font-semibold text-white transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  background:
                    "linear-gradient(135deg, #38bdf8 0%, #2563eb 54%, #1d4ed8 100%)",
                  boxShadow: value
                    ? "0 12px 28px rgba(37,99,235,0.28)"
                    : "none",
                }}
              >
                {isAnalyzing ? "Analyzing..." : "Analyze Palm"}
              </button>
            </div>
          </div>
        ) : (
          <div className="relative z-10">
            <div className="hidden text-center sm:block">
              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-[28px] border border-sky-300/20 bg-sky-300/[0.08] text-sky-200 shadow-[0_0_34px_rgba(56,189,248,0.18)] transition group-hover:scale-[1.03]">
                <HandIcon />
              </div>

              <h2 className="mt-5 text-[28px] font-semibold leading-tight tracking-tight text-white/95">
                {title}
              </h2>
              <p className="mx-auto mt-2 max-w-[360px] text-[14px] leading-6 text-white/48">
                {subtitle}
              </p>

              <button
                type="button"
                onClick={openGallery}
                disabled={disabled || isAnalyzing}
                className="mt-6 min-h-12 rounded-2xl px-6 text-[15px] font-semibold text-white transition hover:scale-[1.01] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  background:
                    "linear-gradient(135deg, #38bdf8 0%, #2563eb 58%, #1d4ed8 100%)",
                  boxShadow: "0 12px 28px rgba(37,99,235,0.28)",
                }}
              >
                Upload Image
              </button>

              <p className="mt-4 text-[12px] text-white/32">
                Drag & Drop support · JPG, PNG, WEBP · Max {maxSize}MB
              </p>
            </div>

            <div className="sm:hidden">
              <button
                type="button"
                onClick={openGallery}
                disabled={disabled || isAnalyzing}
                className="flex min-h-[210px] w-full flex-col items-center justify-center rounded-[22px] border border-dashed border-sky-300/30 bg-sky-300/[0.07] px-5 text-center transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="text-[25px] font-semibold leading-tight text-white/95">
                  {"\uD83D\uDCF7 Upload Palm Photo"}
                </span>
                <span className="mt-3 max-w-[270px] text-[14px] leading-6 text-white/48">
                  Take a clear picture of your dominant hand.
                </span>
              </button>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={openCamera}
                  disabled={!allowCamera || disabled || isAnalyzing}
                  className="min-h-12 rounded-2xl px-3 text-[14px] font-semibold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    background:
                      "linear-gradient(135deg, #38bdf8 0%, #2563eb 58%, #1d4ed8 100%)",
                    boxShadow: "0 10px 24px rgba(37,99,235,0.25)",
                  }}
                >
                  Take Photo
                </button>
                <button
                  type="button"
                  onClick={openGallery}
                  disabled={disabled || isAnalyzing}
                  className="min-h-12 rounded-2xl border border-white/[0.10] bg-white/[0.05] px-3 text-[14px] font-semibold text-white/70 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Choose from Gallery
                </button>
              </div>

              <p className="mt-3 text-center text-[11px] text-white/32">
                JPG, PNG, WEBP · Max {maxSize}MB
              </p>
            </div>
          </div>
        )}

        {error && (
          <p className="relative z-10 mt-3 rounded-2xl border border-red-300/20 bg-red-400/10 px-3 py-2 text-center text-[12px] text-red-100/90">
            {error}
          </p>
        )}
      </div>

      <style>{`
        @keyframes palmFloat {
          0%, 100% { transform: translateY(0) rotate(-1deg); }
          50% { transform: translateY(-5px) rotate(1deg); }
        }

        .bhagya-hand-icon {
          animation: palmFloat 3.8s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

function HandIcon() {
  return (
    <svg
      className="bhagya-hand-icon h-14 w-14"
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M24.5 33V15.5a4 4 0 0 1 8 0V31M32.5 31V11.5a4 4 0 0 1 8 0V32M40.5 32V16.5a4 4 0 0 1 8 0v20.8M24.5 33V22.5a4 4 0 0 0-8 0V38c0 11.1 7.4 18 18.2 18h5.4c10.2 0 16.4-6.6 16.4-16.4v-8.1a4 4 0 0 0-8 0V37"
        stroke="currentColor"
        strokeWidth="3.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M23 43c5.8-1.2 11.7-1.2 17.5 0M25 49c4.4-1 8.9-1 13.4 0"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}
