import type { CSSProperties } from "react";

type BhagyaLogoProps = {
  size?: number;
  variant?: "icon" | "full";
  showWordmark?: boolean;
  className?: string;
};

export default function BhagyaLogo({
  size = 28,
  variant = "icon",
  showWordmark = false,
  className = "",
}: BhagyaLogoProps) {
  const iconStyle = { "--bhagya-logo-size": `${size}px` } as CSSProperties;
  const icon = (
    <span aria-hidden="true" className={`bhagya-mandala-logo ${className}`} style={iconStyle} />
  );

  if (variant === "icon" && !showWordmark) return icon;

  return (
    <span className="inline-flex items-center gap-2.5">
      {icon}
      <span className="text-left">
        <span className="block font-semibold leading-none tracking-tight">Bhagya.ai</span>
        <span className="mt-1 block text-[0.7em] leading-none text-sky-300/70">AI Spiritual Guidance</span>
      </span>
    </span>
  );
}
