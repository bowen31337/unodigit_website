'use client';

import { useRef, useState, ReactNode } from 'react';
import { motion } from 'motion/react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  tilt?: boolean;
}

export default function GlassCard({ children, className = '', tilt = true }: GlassCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const tiltX = tilt && isHovered ? (mousePosition.y / (ref.current?.offsetHeight || 1) - 0.5) * -5 : 0;
  const tiltY = tilt && isHovered ? (mousePosition.x / (ref.current?.offsetWidth || 1) - 0.5) * 5 : 0;

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        transform: `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`,
        background: isHovered
          ? `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(6, 182, 212, 0.1), transparent 40%)`
          : undefined,
      }}
      className={`relative glass rounded-xl p-8 transition-all duration-300 ${
        isHovered ? 'border-primary/30' : ''
      } ${className}`}
    >
      {children}
    </motion.div>
  );
}

