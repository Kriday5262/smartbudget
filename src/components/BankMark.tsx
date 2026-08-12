import type { BankName } from "@/lib/store";

const ICON_MAP: Record<string, string> = {
  HDFC: "/icons/icon-hdfc-bank.png",
  ICICI: "/icons/icon-icici-bank.png",
  Kotak: "/icons/icon-kotak-bank.png",
  Axis: "/icons/icon-axis-bank.png",
  SBI: "/icons/icon-sbi-bank.png",
  Other: "/icons/icon-other.png",
};

export function BankMark({ bank, className }: { bank?: BankName; className?: string }) {
  if (!bank || !ICON_MAP[bank]) {
    return (
      <svg viewBox="0 0 24 24" className={className} role="img" aria-label={bank ?? "Bank"}>
        <rect width="24" height="24" rx="7" className="fill-muted" />
        <path d="M5 10.5 12 6l7 4.5M6.8 11v6.2M11 11v6.2M15.2 11v6.2M4.8 18.4h14.4" className="stroke-muted-foreground" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      </svg>
    );
  }
  return <img src={ICON_MAP[bank]} alt={bank} className={className} style={{ objectFit: "contain" }} />;
}
