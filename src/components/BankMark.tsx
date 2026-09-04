import type { BankName } from "@/lib/store";

const ICON_MAP: Record<string, string> = {
  HDFC: "/icons/icon-hdfc-bank.png",
  ICICI: "/icons/icon-icici-bank.png",
  Kotak: "/icons/icon-kotak-bank.png",
  Axis: "/icons/icon-axis-bank.png",
  SBI: "/icons/icon-sbi-bank.png",
  Other: "/icons/icon-other.png",
};

const BRAND_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  SBI: { bg: "#0072BC", text: "#FFFFFF", label: "SBI" },
  HDFC: { bg: "#004C8F", text: "#FFFFFF", label: "HDFC" },
  ICICI: { bg: "#F37021", text: "#FFFFFF", label: "ICICI" },
  Axis: { bg: "#97144D", text: "#FFFFFF", label: "AXIS" },
  Kotak: { bg: "#EE1C25", text: "#FFFFFF", label: "KOTAK" },
  PNB: { bg: "#A21920", text: "#FFFFFF", label: "PNB" },
  BOB: { bg: "#F26522", text: "#FFFFFF", label: "BOB" },
  Canara: { bg: "#0055A5", text: "#FFFFFF", label: "CAN" },
  IndusInd: { bg: "#8A1B29", text: "#FFFFFF", label: "IND" },
  "IDFC FIRST": { bg: "#9E1B32", text: "#FFFFFF", label: "IDFC" },
  "Yes Bank": { bg: "#005B9A", text: "#FFFFFF", label: "YES" },
  "Union Bank": { bg: "#004B87", text: "#FFFFFF", label: "UBI" },
  "Federal Bank": { bg: "#005596", text: "#FFFFFF", label: "FED" },
  "Indian Bank": { bg: "#1D3557", text: "#FFFFFF", label: "IND" },
  "RBL Bank": { bg: "#002B49", text: "#FFFFFF", label: "RBL" },
  "Bandhan Bank": { bg: "#003366", text: "#FFFFFF", label: "BAND" },
  "Paytm Bank": { bg: "#00B9F1", text: "#FFFFFF", label: "PAYTM" },
  "Airtel Bank": { bg: "#E40000", text: "#FFFFFF", label: "AIR" },
  PhonePe: { bg: "#5F259F", text: "#FFFFFF", label: "PE" },
  "Google Pay": { bg: "#4285F4", text: "#FFFFFF", label: "GPay" },
  Paytm: { bg: "#002E6D", text: "#00B9F1", label: "Paytm" },
  CRED: { bg: "#121212", text: "#FFFFFF", label: "CRED" },
  "Amazon Pay": { bg: "#232F3E", text: "#FF9900", label: "AMZN" },
  BHIM: { bg: "#005B9A", text: "#FFFFFF", label: "BHIM" },
  Mobikwik: { bg: "#0072CE", text: "#FFFFFF", label: "MOBI" },
  Slice: { bg: "#512DA8", text: "#FFFFFF", label: "SL" },
  Fi: { bg: "#00D695", text: "#000000", label: "FI" },
  Jupiter: { bg: "#2A2A2A", text: "#00E676", label: "JUP" },
  OneCard: { bg: "#111111", text: "#F37021", label: "ONE" },
};

export function BankMark({ bank, className }: { bank?: BankName; className?: string }) {
  if (bank && ICON_MAP[bank]) {
    return (
      <img src={ICON_MAP[bank]} alt={bank} className={className} style={{ objectFit: "contain" }} />
    );
  }

  const b = bank ? BRAND_COLORS[bank] : undefined;
  if (b) {
    return (
      <svg viewBox="0 0 32 32" className={className} role="img" aria-label={bank}>
        <rect width="32" height="32" rx="9" fill={b.bg} />
        <text
          x="16"
          y="20.5"
          fill={b.text}
          fontSize="10"
          fontWeight="800"
          fontFamily="system-ui, sans-serif"
          textAnchor="middle"
        >
          {b.label}
        </text>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label={bank ?? "Bank"}>
      <rect width="24" height="24" rx="7" className="fill-muted" />
      <path
        d="M5 10.5 12 6l7 4.5M6.8 11v6.2M11 11v6.2M15.2 11v6.2M4.8 18.4h14.4"
        className="stroke-muted-foreground"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
