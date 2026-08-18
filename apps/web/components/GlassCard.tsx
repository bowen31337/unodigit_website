import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  /** Material thickness. Thicker = more opaque and more separated from content. */
  material?: 'thin' | 'regular' | 'thick';
  /** Adds the brand color wash — for the one or two panels that should stand out. */
  tinted?: boolean;
  /** Lifts on hover. Only for cards that are actually a link or a target. */
  interactive?: boolean;
  as?: 'div' | 'article' | 'li';
}

const MATERIALS = {
  thin: 'glass-thin',
  regular: 'glass',
  thick: 'glass-thick',
};

/**
 * A real Apple material rather than a blurred rectangle. The four optical
 * layers — tint, backdrop blur + saturation boost, inset specular top edge,
 * and hairline rim + depth shadow — all live in the `.glass` class in
 * globals.css, along with the @supports / reduced-transparency / more-contrast
 * fallbacks.
 *
 * The previous version's mouse-tracked 3D rotateX/rotateY tilt is gone. Apple
 * surfaces do not deform toward the cursor; depth comes from how the material
 * catches light, not from perspective tricks. Hover now reads as a 2px lift,
 * which is what a physical card resting on a surface would actually do.
 *
 * Note: never stack one of these directly on another — the double blur muddies
 * both. Put an opaque layer in between.
 */
export default function GlassCard({
  children,
  className,
  material = 'regular',
  tinted = false,
  interactive = false,
  as: Tag = 'div',
}: GlassCardProps) {
  return (
    <Tag
      className={cn(
        MATERIALS[material],
        'relative p-s8',
        tinted && 'glass-tinted',
        interactive && [
          'transition-[transform,box-shadow] duration-base ease-out',
          'hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.995]',
        ],
        className
      )}
    >
      {/* Sits above the ::before tint wash so content is never blended into. */}
      <div className="relative z-[1]">{children}</div>
    </Tag>
  );
}
