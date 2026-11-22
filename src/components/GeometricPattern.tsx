import React from 'react';
import type { BackgroundStyle } from '../types/dhikr';

interface GeometricPatternProps {
  styleType?: BackgroundStyle;
  customImage?: string;
  className?: string;
}

export const GeometricPattern: React.FC<GeometricPatternProps> = ({
  styleType = 'geometric',
  customImage,
  className = '',
}) => {
  if (styleType === 'minimal' || styleType === 'solid') {
    return null;
  }

  if (styleType === 'custom-image' && customImage) {
    return (
      <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
        <img
          src={customImage}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover opacity-25"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, var(--bg-canvas) 0%, transparent 45%, var(--bg-canvas) 100%)',
          }}
        />
      </div>
    );
  }

  if (styleType === 'gradient') {
    return (
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 ${className}`}
        style={{
          background:
            'radial-gradient(circle at 50% 18%, var(--accent-soft) 0%, transparent 62%), radial-gradient(circle at 85% 88%, var(--accent-gold-soft) 0%, transparent 52%)',
        }}
      />
    );
  }

  // Subtle Islamic 8-pointed geometric lattice pattern
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden opacity-[0.06] ${className}`}>
      <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="islamic-octagram-grid" width="84" height="84" patternUnits="userSpaceOnUse">
            <path
              d="M42 6 L52 32 L78 42 L52 52 L42 78 L32 52 L6 42 L32 32 Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
            />
            <rect
              x="24"
              y="24"
              width="36"
              height="36"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.7"
              transform="rotate(45 42 42)"
            />
            <circle cx="42" cy="42" r="4" fill="none" stroke="currentColor" strokeWidth="0.7" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#islamic-octagram-grid)" className="text-[var(--accent-primary)]" />
      </svg>
    </div>
  );
};
