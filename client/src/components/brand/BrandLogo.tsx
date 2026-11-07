import React from "react";
import Link from "next/link";

interface BrandLogoProps {
  className?: string;
  iconOnly?: boolean;
  size?: "sm" | "md" | "lg";
}

/**
 * Eventora Geometric Brand Icon and Logo
 */
export function BrandIcon({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect width="512" height="512" rx="112" className="fill-foreground" />
      <path
        d="M 120 144 C 120 126 134 112 152 112 L 356 112 C 372 112 384 124 384 140 C 384 156 372 168 356 168 L 180 168 L 180 226 L 288 226 C 304 226 316 238 316 254 C 316 270 304 282 288 282 L 180 282 L 180 344 L 356 344 C 372 344 384 356 384 372 C 384 388 372 400 356 400 L 152 400 C 134 400 120 386 120 368 Z"
        className="fill-background"
      />
      <path
        d="M 364 200 Q 364 254 310 254 Q 364 254 364 308 Q 364 254 418 254 Q 364 254 364 200 Z"
        className="fill-background"
      />
    </svg>
  );
}

export function BrandLogo({
  className = "",
  iconOnly = false,
  size = "md",
}: BrandLogoProps) {
  const iconSizes = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-10 w-10",
  };

  const textSizes = {
    sm: "text-base",
    md: "text-xl",
    lg: "text-2xl",
  };

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <BrandIcon className={`${iconSizes[size]} transition-transform duration-200 group-hover:scale-105`} />
      {!iconOnly && (
        <span
          className={`font-extrabold tracking-tight text-foreground ${textSizes[size]}`}
        >
          EVENTORA
        </span>
      )}
    </div>
  );
}

