import { Skin } from '../types/game';

interface SkinAvatarProps {
  skin: Skin;
  size?: number;
  className?: string;
}

/** Lightweight DOM preview of a mascot skin for menus and the shop. */
export function SkinAvatar({ skin, size = 72, className = '' }: SkinAvatarProps) {
  let background = `radial-gradient(circle at 32% 28%, #ffffff 0%, ${skin.primaryColor} 30%, ${skin.secondaryColor} 100%)`;
  if (skin.isRainbow) {
    background = 'conic-gradient(from 200deg, #FF8EB5, #FFD65A, #8EF0B5, #72D7FF, #C59BFF, #FF8EB5)';
  } else if (skin.isGalaxy) {
    background = `radial-gradient(circle at 30% 30%, #9D8CFF 0%, ${skin.primaryColor} 40%, ${skin.secondaryColor} 100%)`;
  }

  const eye = Math.max(5, size * 0.12);

  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }} aria-hidden>
      {skin.hasCrown && (
        <span className="absolute left-1/2 -translate-x-1/2" style={{ top: -size * 0.32, fontSize: size * 0.38 }}>
          👑
        </span>
      )}
      {skin.hasLeaves && (
        <span className="absolute left-1/2 -translate-x-1/2" style={{ top: -size * 0.26, fontSize: size * 0.3 }}>
          🌿
        </span>
      )}
      <div
        className="w-full h-full rounded-full"
        style={{ background, boxShadow: `inset -${size * 0.08}px -${size * 0.1}px 0 rgba(0,0,0,0.12), 0 ${size * 0.08}px ${size * 0.2}px rgba(52,48,71,0.18)` }}
      />
      {skin.hasStars && <span className="absolute -right-1 -top-1" style={{ fontSize: size * 0.24 }}>✨</span>}
      <div className="absolute flex justify-center" style={{ top: size * 0.36, left: 0, right: 0, gap: size * 0.18 }}>
        {[0, 1].map((i) => (
          <span key={i} className="rounded-full" style={{ width: eye, height: eye * 1.3, background: skin.eyeColor || '#343047' }} />
        ))}
      </div>
      <div className="absolute flex justify-between" style={{ top: size * 0.56, left: size * 0.16, right: size * 0.16 }}>
        {[0, 1].map((i) => (
          <span key={i} className="rounded-full opacity-70" style={{ width: eye * 1.2, height: eye * 0.7, background: skin.accentColor }} />
        ))}
      </div>
    </div>
  );
}
