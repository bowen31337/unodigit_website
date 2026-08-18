import { cn } from '@/lib/utils';

interface GradientMeshProps {
  className?: string;
  /** Adds a very slow ambient drift. Off by default — restraint is the point. */
  animated?: boolean;
  /** Fades the mesh into the page background at the bottom edge. */
  fadeOut?: boolean;
  /**
   * Masks the mesh away at the top and bottom edges. Use for mid-page sections,
   * where a pool running full-strength into a section boundary draws a hard
   * horizontal seam across the page.
   */
  soft?: boolean;
}

/**
 * The ambient brand wash that replaced the canvas particle field.
 *
 * Two blurred radial pools in the logo's two hues, sitting under the content
 * as light rather than as decoration. Pure CSS gradients — no canvas, no
 * requestAnimationFrame, no per-frame main-thread work, and nothing to clean
 * up on unmount.
 *
 * Each pool fades to a zero-alpha copy of its OWN colour rather than to the
 * `transparent` keyword. `transparent` is rgba(0,0,0,0), so interpolating
 * toward it pulls grey through the gradient's midpoint and the wash reads as a
 * smudge on a light page. Fading alpha alone keeps the hue clean throughout.
 *
 * The optional drift animates `transform` only, so it stays on the compositor,
 * and collapses under prefers-reduced-motion via the global rule.
 */
export default function GradientMesh({
  className,
  animated = false,
  fadeOut = true,
  soft = false,
}: GradientMeshProps) {
  const softMask = 'linear-gradient(to bottom, transparent, black 22%, black 78%, transparent)';

  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
      style={
        soft
          ? { WebkitMaskImage: softMask, maskImage: softMask }
          : undefined
      }
    >
      <div
        className={cn(
          'absolute -left-[15%] -top-[25%] h-[70vh] w-[65vw] rounded-full blur-3xl',
          animated && 'animate-mesh-drift'
        )}
        style={{
          background: 'radial-gradient(circle, var(--mesh-1), var(--mesh-1-fade) 70%)',
        }}
      />
      <div
        className={cn(
          'absolute -bottom-[20%] -right-[15%] h-[65vh] w-[60vw] rounded-full blur-3xl',
          animated && 'animate-mesh-drift'
        )}
        style={{
          background: 'radial-gradient(circle, var(--mesh-2), var(--mesh-2-fade) 70%)',
          animationDelay: '-12s',
        }}
      />
      {fadeOut && (
        <div
          className="absolute inset-x-0 bottom-0 h-48"
          style={{ background: 'linear-gradient(to bottom, var(--mesh-1-fade), var(--bg))' }}
        />
      )}
    </div>
  );
}
