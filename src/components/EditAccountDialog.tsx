import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useUI, uiActions } from "@/lib/ui-store";
import { SearchSelect, UpiPicker } from "@/components/pickers";
import {
  useDB,
  updateAccount,
  BANKS,
  CARD_BRANDS,
  ACCOUNT_TYPES,
  type BankName,
  type CardBrand,
  type AccountType,
} from "@/lib/store";
import { cn } from "@/lib/utils";

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** Full-fledged editing for an existing account — every field the add form has. */
export function EditAccountDialog() {
  const { editAccountId } = useUI();
  const db = useDB();
  const account = db.accounts.find((a) => a.id === editAccountId);

  return (
    <Dialog open={!!account} onOpenChange={(o) => !o && uiActions.editAccount(undefined)}>
      <DialogContent
        className={cn(
          "max-h-[88vh] overflow-y-auto rounded-3xl sm:max-w-lg",
          "max-sm:top-auto max-sm:bottom-0 max-sm:w-full max-sm:max-w-full max-sm:translate-y-0",
          "max-sm:rounded-b-none max-sm:rounded-t-[32px] max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
        )}
      >
        <DialogHeader>
          <DialogTitle>Edit account</DialogTitle>
        </DialogHeader>
        {account && <Form key={account.id} id={account.id} />}
      </DialogContent>
    </Dialog>
  );
}

function Form({ id }: { id: string }) {
  const db = useDB();
  const a = db.accounts.find((x) => x.id === id)!;
  const [name, setName] = useState(a.name);
  const [type, setType] = useState<AccountType>(a.type);
  const [bank, setBank] = useState<BankName>(a.bank ?? "Other");
  const [brand, setBrand] = useState<CardBrand>(a.brand ?? "visa");
  const [balance, setBalance] = useState(String(a.startingBalance ?? 0));
  const [limit, setLimit] = useState(a.creditLimit ? String(a.creditLimit) : "");
  const [billing, setBilling] = useState(a.billingDate ? String(a.billingDate) : "");
  const [due, setDue] = useState(a.dueDate ? String(a.dueDate) : "");
  const [maturityDate, setMaturityDate] = useState(a.maturityDate ?? "");
  const [rateOfInterest, setRateOfInterest] = useState(
    a.rateOfInterest ? String(a.rateOfInterest) : "",
  );
  const [upiVpa, setUpiVpa] = useState(a.upiVpa ?? "");
  const [error, setError] = useState("");

  useEffect(() => setError(""), [name]);

  const isDeposit = type === "fd" || type === "rd";

  function save() {
    if (!name.trim()) {
      setError("Give the account a name");
      return;
    }
    if (rateOfInterest && Number(rateOfInterest) < 0) {
      setError("Rate of interest can't be negative");
      return;
    }
    updateAccount(id, {
      name: name.trim(),
      type,
      bank,
      brand: type === "credit" ? brand : undefined,
      startingBalance: Number(balance) || 0,
      creditLimit: type === "credit" ? Number(limit) || undefined : undefined,
      billingDate: type === "credit" ? Number(billing) || undefined : undefined,
      dueDate: type === "credit" ? Number(due) || undefined : undefined,
      maturityDate: isDeposit ? maturityDate || undefined : undefined,
      rateOfInterest: isDeposit && rateOfInterest ? Number(rateOfInterest) : undefined,
      onBudget: type === "account" || type === "credit",
      upiVpa: upiVpa.trim() || undefined,
    });
    toast.success("Account updated");
    uiActions.editAccount(undefined);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" error={error}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="UPI id">
          <UpiPicker value={upiVpa} onChange={setUpiVpa} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <SearchSelect
            value={type}
            onChange={(v) => setType(v as AccountType)}
            options={ACCOUNT_TYPES.map((t) => ({ value: t.id, label: t.label }))}
            title="Account type"
          />
        </Field>
        <Field label="Bank">
          <SearchSelect
            value={bank}
            onChange={(v) => setBank(v as BankName)}
            options={BANKS.map((b) => ({ value: b, label: b }))}
            title="Bank"
          />
        </Field>
      </div>

      {type === "credit" && (
        <Field label="Card network">
          <SearchSelect
            value={brand}
            onChange={(v) => setBrand(v as CardBrand)}
            options={CARD_BRANDS.map((b) => ({ value: b.id, label: b.label }))}
            title="Card network"
          />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label={type === "credit" ? "Opening outstanding (₹)" : "Starting balance (₹)"}>
          <Input
            className="num"
            inputMode="decimal"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
          />
        </Field>
        {type === "credit" && (
          <Field label="Credit limit (₹)">
            <Input
              className="num"
              inputMode="decimal"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </Field>
        )}
      </div>

      {type === "credit" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Billing date">
            <Input
              className="num"
              inputMode="numeric"
              value={billing}
              onChange={(e) => setBilling(e.target.value)}
            />
          </Field>
          <Field label="Due date">
            <Input
              className="num"
              inputMode="numeric"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </Field>
        </div>
      )}

      {isDeposit && (
        <div className="space-y-4">
          <Field label="Maturity date">
            <Input
              type="date"
              value={maturityDate}
              onChange={(e) => setMaturityDate(e.target.value)}
              className="w-full"
            />
          </Field>
          <Field label="Rate of interest (% p.a.)">
            <Input
              className="num w-full"
              inputMode="decimal"
              value={rateOfInterest}
              onChange={(e) => setRateOfInterest(e.target.value)}
            />
          </Field>
        </div>
      )}

      <Button className="h-11 w-full rounded-xl font-bold" onClick={save}>
        Save changes
      </Button>
    </div>
  );
}
