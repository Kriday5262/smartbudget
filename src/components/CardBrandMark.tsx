const ICON_MAP: Record<string, string> = {
  visa: "/icons/icon-visa.png",
  mastercard: "/icons/icon-mastercard.png",
  amex: "/icons/icon-amex.png",
  rupay: "/icons/icon-rupay.png",
};

export function CardBrandMark({ brand, className }: { brand: string; className?: string }) {
  const src = ICON_MAP[brand];
  if (!src) return null;
  return <img src={src} alt={brand} className={className} style={{ objectFit: "contain" }} />;
}
