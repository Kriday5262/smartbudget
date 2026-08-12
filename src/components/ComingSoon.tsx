import { Rocket } from "lucide-react";

export function ComingSoon({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <div className="surface flex flex-col items-center gap-4 p-10 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl gradient-primary text-primary-foreground">
          <Rocket className="h-6 w-6" strokeWidth={2} />
        </span>
        <p className="max-w-sm text-sm text-muted-foreground">{blurb}</p>
      </div>
    </div>
  );
}
