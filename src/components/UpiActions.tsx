import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import QRCode from "qrcode";
import { QrCode, Copy, Check } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export function UpiActions({ upiVpa, name }: { upiVpa: string; name: string }) {
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [src, setSrc] = useState("");

  const qrPayload = `upi://pay?pa=${encodeURIComponent(upiVpa)}&pn=${encodeURIComponent(name)}&cu=INR`;

  const copy = () => {
    navigator.clipboard?.writeText(upiVpa);
    setCopied(true);
    toast.success("UPI id copied");
    setTimeout(() => setCopied(false), 1500);
  };

  useEffect(() => {
    if (!qrOpen) return;
    QRCode.toDataURL(qrPayload, { width: 640, margin: 2 })
      .then(setSrc)
      .catch(() => setSrc(""));
  }, [qrOpen, qrPayload]);

  return (
    <>
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="font-mono text-xs text-muted-foreground">{upiVpa}</span>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy UPI id"
          className="tap rounded-md p-1 text-muted-foreground hover:text-foreground"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-primary" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setQrOpen(true)}
          aria-label="Show UPI QR"
          className="tap rounded-md p-1 text-muted-foreground hover:text-foreground"
        >
          <QrCode className="h-3.5 w-3.5" />
        </button>
      </div>
      <Dialog open={qrOpen} onOpenChange={(o) => !o && setQrOpen(false)}>
        <DialogContent
          className={cn(
            "max-h-[88vh] overflow-y-auto rounded-3xl sm:max-w-lg",
            "max-sm:top-auto max-sm:bottom-0 max-sm:w-full max-sm:max-w-full max-sm:translate-y-0",
            "max-sm:rounded-b-none max-sm:rounded-t-[32px] max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
          )}>
          <DialogTitle>UPI QR</DialogTitle>
          <div className="flex flex-col items-center gap-3 pb-2 text-center">
            <p className="text-sm font-bold">{name}</p>
            <p className="font-mono text-[11px] text-muted-foreground">{upiVpa}</p>
            {src ? (
              <img
                src={src}
                alt={`UPI QR for ${upiVpa}`}
                className="h-56 w-56 rounded-2xl border border-border bg-white p-2"
              />
            ) : (
              <div className="h-56 w-56 animate-pulse rounded-2xl bg-muted" />
            )}
            <p className="text-[11px] text-muted-foreground">Scan with any UPI app to pay {name}</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
