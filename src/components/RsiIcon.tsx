interface RsiIconProps {
  src?: string | null;
  className?: string;
  toneClassName?: string;
}

export default function RsiIcon({
  src,
  className = 'h-4 w-4',
  toneClassName = 'bg-slate-500 dark:bg-slate-200',
}: RsiIconProps) {
  if (!src) return null;

  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 opacity-80 ${toneClassName} ${className}`}
      style={{
        maskImage: `url(${src})`,
        WebkitMaskImage: `url(${src})`,
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
      }}
    />
  );
}
