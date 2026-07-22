import Image from "next/image";

type BrandLogoProps = {
  className?: string;
  imageClassName?: string;
  priority?: boolean;
};

export function BrandLogo({
  className = "h-12 w-12 rounded-xl",
  imageClassName = "p-1",
  priority = false,
}: BrandLogoProps) {
  return (
    <div
      className={`relative shrink-0 overflow-hidden border border-slate-200 bg-white shadow-sm dark:border-white/10 ${className}`}
    >
      <Image
        src="/sanghvi-logo.png"
        alt="Sanghvi ERP"
        fill
        sizes="64px"
        priority={priority}
        className={`object-contain ${imageClassName}`}
      />
    </div>
  );
}
