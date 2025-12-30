interface LogoProps {
  className?: string;
  showText?: boolean;
}

export default function Logo({ className = '', showText = true }: LogoProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg
        width="40"
        height="40"
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-10 h-10"
        aria-label="Uno Digit Logo"
      >
        {/* Modern, bold U shape - Flat Design */}
        <path
          d="M11 11V21C11 25.9706 15.0294 30 20 30C24.9706 30 29 25.9706 29 21V11"
          stroke="#06b6d4"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Accent Nodes - Secondary Brand Color */}
        <circle cx="29" cy="11" r="3" fill="#8b5cf6" />
        <circle cx="11" cy="11" r="3" fill="#8b5cf6" />
      </svg>
      
      {showText && (
        <span className="font-bold text-lg tracking-tight text-foreground">
          Uno <span className="text-[#06b6d4]">Digit</span>
        </span>
      )}
    </div>
  );
}

