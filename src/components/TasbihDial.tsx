import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { CounterCustomization } from '../types/dhikr';
import { cn } from '../utils/cn';

interface TasbihDialProps {
  count: number;
  target: number;
  percentage: number;
  round: number;
  customization: CounterCustomization;
  onTap: () => void;
  tapLabel: string;
  previewMode?: boolean;
}

export const TasbihDial: React.FC<TasbihDialProps> = ({
  count,
  target,
  percentage,
  round,
  customization,
  onTap,
  tapLabel,
  previewMode = false,
}) => {
  const [rippleKey, setRippleKey] = useState(0);

  const sizePx =
    previewMode
      ? 200
      : customization.buttonSize === 'compact'
        ? 220
        : customization.buttonSize === 'large'
          ? 300
          : 262;

  const strokeWidth = customization.ringStyle === 'dotted' ? 7 : 8;
  const radius = (sizePx - strokeWidth * 2 - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (Math.min(100, percentage) / 100) * circumference;

  const accentColor =
    customization.counterColor === 'theme'
      ? 'var(--accent-primary)'
      : customization.counterColor;

  const numberFontClass =
    customization.numberFont === 'mono'
      ? 'font-mono-num'
      : customization.numberFont === 'display'
        ? 'font-display tabular-nums'
        : 'font-sans tabular-nums';

  const numberSizeClass = previewMode
    ? 'text-4xl'
    : customization.numberSize === 'md'
      ? 'text-5xl'
      : customization.numberSize === 'xl'
        ? 'text-7xl'
        : 'text-6xl';

  const shapeClass =
    customization.shape === 'squircle'
      ? 'rounded-[34%]'
      : customization.shape === 'arch'
        ? 'rounded-t-full rounded-b-[28%]'
        : 'rounded-full';

  const handlePress = () => {
    setRippleKey((k) => k + 1);
    onTap();
  };

  const formattedCount = String(count).padStart(3, '0');

  return (
    <div className="relative flex items-center justify-center select-none">
      {/* Subtle tap ripple */}
      <AnimatePresence>
        {customization.animation === 'ripple' && rippleKey > 0 && (
          <motion.span
            key={rippleKey}
            initial={{ scale: 0.92, opacity: 0.35 }}
            animate={{ scale: 1.18, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
            aria-hidden="true"
            className={cn('pointer-events-none absolute border-2', shapeClass)}
            style={{
              width: sizePx,
              height: sizePx,
              borderColor: accentColor,
            }}
          />
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={handlePress}
        aria-label={`${tapLabel}. Current count ${count} of ${target * round}`}
        data-testid="tasbih-tap-button"
        whileTap={
          customization.animation === 'none'
            ? undefined
            : customization.animation === 'bead-pulse'
              ? { scale: 0.965 }
              : { scale: 0.955 }
        }
        transition={{ duration: 0.12 }}
        className={cn(
          'relative flex flex-col items-center justify-center cursor-pointer transition-shadow focus-visible:ring-4',
          shapeClass,
          customization.shape === 'minimal-ring'
            ? 'bg-transparent'
            : 'bg-[var(--bg-surface)] border border-[var(--border-subtle)]'
        )}
        style={{
          width: sizePx,
          height: sizePx,
          boxShadow:
            customization.shape === 'minimal-ring' ? 'none' : 'var(--shadow-counter)',
        }}
      >
        {/* SVG Circular Progress Ring */}
        <svg
          width={sizePx}
          height={sizePx}
          viewBox={`0 0 ${sizePx} ${sizePx}`}
          className="absolute inset-0 -rotate-90 pointer-events-none"
          aria-hidden="true"
        >
          {/* Track */}
          <circle
            cx={sizePx / 2}
            cy={sizePx / 2}
            r={radius}
            fill="none"
            stroke="var(--ring-track)"
            strokeWidth={strokeWidth}
            strokeDasharray={
              customization.ringStyle === 'segmented'
                ? '10 6'
                : customization.ringStyle === 'dotted'
                  ? '3 9'
                  : undefined
            }
          />
          {/* Progress */}
          <circle
            cx={sizePx / 2}
            cy={sizePx / 2}
            r={radius}
            fill="none"
            stroke={customization.ringStyle === 'gold-glow' ? 'var(--accent-gold)' : accentColor}
            strokeWidth={strokeWidth}
            strokeLinecap={customization.ringStyle === 'segmented' ? 'butt' : 'round'}
            strokeDasharray={
              customization.ringStyle === 'segmented'
                ? '10 6'
                : customization.ringStyle === 'dotted'
                  ? '3 9'
                  : circumference
            }
            strokeDashoffset={
              customization.ringStyle === 'segmented' || customization.ringStyle === 'dotted'
                ? undefined
                : dashOffset
            }
            pathLength={
              customization.ringStyle === 'segmented' || customization.ringStyle === 'dotted'
                ? 100
                : undefined
            }
            style={
              customization.ringStyle === 'segmented' || customization.ringStyle === 'dotted'
                ? {
                    clipPath: `inset(0 ${100 - Math.min(100, percentage)}% 0 0)`,
                    transition: 'all 180ms cubic-bezier(0.16, 1, 0.3, 1)',
                  }
                : {
                    transition: 'stroke-dashoffset 180ms cubic-bezier(0.16, 1, 0.3, 1)',
                    filter:
                      customization.ringStyle === 'gold-glow'
                        ? 'drop-shadow(0 0 6px rgba(184, 138, 62, 0.45))'
                        : undefined,
                  }
            }
          />
        </svg>

        {/* Inner counter readout */}
        <div className="relative z-10 flex flex-col items-center justify-center px-4 text-center">
          <motion.span
            key={count}
            initial={customization.animation === 'none' ? false : { scale: 0.92, opacity: 0.7 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.14 }}
            className={cn(
              'font-bold tracking-tight leading-none text-[var(--text-primary)]',
              numberFontClass,
              numberSizeClass
            )}
            data-testid="counter-value"
          >
            {formattedCount}
          </motion.span>

          {customization.showTarget && (
            <span className="mt-2 text-sm font-medium text-[var(--text-muted)] tabular-nums">
              / {target * round}
            </span>
          )}

          <span
            className="mt-2.5 text-xs font-medium tracking-wide"
            style={{ color: accentColor }}
          >
            {tapLabel}
          </span>
        </div>
      </motion.button>
    </div>
  );
};
