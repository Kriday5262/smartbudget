import {
  Home,
  ShoppingCart,
  ShoppingBag,
  Zap,
  Droplets,
  Flame,
  Wifi,
  Smartphone,
  Utensils,
  Coffee,
  Pizza,
  Cookie,
  Salad,
  GraduationCap,
  Baby,
  Bus,
  Car,
  Fuel,
  Train,
  Plane,
  PlaneTakeoff,
  ShieldAlert,
  PiggyBank,
  Wallet,
  Coins,
  Landmark,
  Banknote,
  HandCoins,
  HeartPulse,
  Stethoscope,
  Dumbbell,
  Clapperboard,
  Music,
  Gamepad2,
  Tv,
  BookOpen,
  Gift,
  Shirt,
  Wrench,
  Scissors,
  PawPrint,
  Trees,
  Camera,
  Receipt,
  CreditCard,
  Tags,
  Sparkles,
  Target,
  Users,
  Star,
  CloudSun,
  Briefcase,
  Bed,
  Heart,
  CircleDollarSign,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/store";

export type CategoryIconDef = { key: string; Icon: LucideIcon };

export const CATEGORY_ICONS: CategoryIconDef[] = [
  { key: "home", Icon: Home },
  { key: "shopping-cart", Icon: ShoppingCart },
  { key: "shopping-bag", Icon: ShoppingBag },
  { key: "zap", Icon: Zap },
  { key: "droplets", Icon: Droplets },
  { key: "flame", Icon: Flame },
  { key: "wifi", Icon: Wifi },
  { key: "smartphone", Icon: Smartphone },
  { key: "utensils", Icon: Utensils },
  { key: "coffee", Icon: Coffee },
  { key: "pizza", Icon: Pizza },
  { key: "cookie", Icon: Cookie },
  { key: "salad", Icon: Salad },
  { key: "graduation-cap", Icon: GraduationCap },
  { key: "baby", Icon: Baby },
  { key: "bus", Icon: Bus },
  { key: "car", Icon: Car },
  { key: "fuel", Icon: Fuel },
  { key: "train", Icon: Train },
  { key: "plane", Icon: Plane },
  { key: "plane-takeoff", Icon: PlaneTakeoff },
  { key: "shield-alert", Icon: ShieldAlert },
  { key: "piggy-bank", Icon: PiggyBank },
  { key: "wallet", Icon: Wallet },
  { key: "coins", Icon: Coins },
  { key: "landmark", Icon: Landmark },
  { key: "banknote", Icon: Banknote },
  { key: "hand-coins", Icon: HandCoins },
  { key: "heart-pulse", Icon: HeartPulse },
  { key: "stethoscope", Icon: Stethoscope },
  { key: "dumbbell", Icon: Dumbbell },
  { key: "clapperboard", Icon: Clapperboard },
  { key: "music", Icon: Music },
  { key: "gamepad-2", Icon: Gamepad2 },
  { key: "tv", Icon: Tv },
  { key: "book-open", Icon: BookOpen },
  { key: "gift", Icon: Gift },
  { key: "shirt", Icon: Shirt },
  { key: "wrench", Icon: Wrench },
  { key: "scissors", Icon: Scissors },
  { key: "paw-print", Icon: PawPrint },
  { key: "trees", Icon: Trees },
  { key: "camera", Icon: Camera },
  { key: "receipt", Icon: Receipt },
  { key: "credit-card", Icon: CreditCard },
  { key: "tags", Icon: Tags },
  { key: "sparkles", Icon: Sparkles },
  { key: "target", Icon: Target },
  { key: "users", Icon: Users },
  { key: "star", Icon: Star },
  { key: "cloud-sun", Icon: CloudSun },
  { key: "briefcase", Icon: Briefcase },
  { key: "bed", Icon: Bed },
  { key: "heart", Icon: Heart },
  { key: "circle-dollar-sign", Icon: CircleDollarSign },
];

const ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  CATEGORY_ICONS.map((i) => [i.key, i.Icon]),
);

const NAME_HINTS: [string, string][] = [
  ["rent", "home"],
  ["grocer", "shopping-cart"],
  ["electric", "zap"],
  ["power", "zap"],
  ["water", "droplets"],
  ["gas", "flame"],
  ["internet", "wifi"],
  ["broadband", "wifi"],
  ["phone", "smartphone"],
  ["mobile", "smartphone"],
  ["dining", "utensils"],
  ["restaurant", "utensils"],
  ["food", "utensils"],
  ["swiggy", "utensils"],
  ["zomato", "utensils"],
  ["coffee", "coffee"],
  ["pizza", "pizza"],
  ["school", "graduation-cap"],
  ["kids", "baby"],
  ["children", "baby"],
  ["transport", "bus"],
  ["auto", "bus"],
  ["petrol", "fuel"],
  ["fuel", "fuel"],
  ["uber", "car"],
  ["ola", "car"],
  ["cab", "car"],
  ["travel", "plane"],
  ["vacation", "plane"],
  ["holiday", "plane"],
  ["emergency", "shield-alert"],
  ["insurance", "shield-alert"],
  ["savings", "piggy-bank"],
  ["invest", "piggy-bank"],
  ["health", "heart-pulse"],
  ["medical", "stethoscope"],
  ["doctor", "stethoscope"],
  ["entertainment", "clapperboard"],
  ["movie", "clapperboard"],
  ["music", "music"],
  ["game", "gamepad-2"],
  ["streaming", "tv"],
  ["netflix", "tv"],
  ["shopping", "shopping-bag"],
  ["clothes", "shirt"],
  ["repair", "wrench"],
  ["maintenance", "wrench"],
  ["gift", "gift"],
  ["charity", "hand-coins"],
  ["tax", "landmark"],
  ["loan", "landmark"],
  ["salary", "banknote"],
  ["income", "banknote"],
  ["book", "book-open"],
  ["pet", "paw-print"],
  ["garden", "trees"],
  ["camera", "camera"],
  ["beauty", "scissors"],
  ["salon", "scissors"],
  ["bill", "receipt"],
  ["train", "train"],
  ["pocket", "wallet"],
];

/** Pick a sensible icon key from a category name, e.g. "Groceries" -> "shopping-cart". */
export function suggestIconKey(name: string): string {
  const n = name.toLowerCase();
  for (const [kw, key] of NAME_HINTS) {
    if (n.includes(kw)) return key;
  }
  return "tags";
}

/** Effective icon key for a category: explicit pick wins, else a name-based suggestion. */
export function categoryIconKey(cat?: { name?: string; icon?: string }): string | undefined {
  if (!cat) return undefined;
  return cat.icon || suggestIconKey(cat.name ?? "");
}

/** Renders a category's icon by key. Renders nothing when unknown/unset. */
export function CategoryGlyph({ icon, className }: { icon?: string; className?: string }) {
  if (!icon) return null;
  const Icon = ICON_MAP[icon];
  if (!Icon) return null;
  return <Icon aria-hidden className={["shrink-0", className].filter(Boolean).join(" ")} />;
}

/** Icon + name for a single category, for inline use inside truncated text lines. */
export function CategoryInline({ cat, className }: { cat?: Category | null; className?: string }) {
  if (!cat) return null;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      <CategoryGlyph icon={categoryIconKey(cat)} className="h-3 w-3" />
      <span className="truncate">{cat.name}</span>
    </span>
  );
}

/** Icons + names for a list of split categories. */
export function CategoryList({
  cats,
  className,
}: {
  cats: Array<Category | undefined | null>;
  className?: string;
}) {
  const present = cats.filter((c): c is Category => Boolean(c));
  if (present.length === 0) return null;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-x-1.5", className)}>
      {present.map((c, i) => (
        <span key={c.id} className="inline-flex min-w-0 items-center gap-1">
          {i > 0 && <span className="text-muted-foreground/60">,</span>}
          <CategoryGlyph icon={categoryIconKey(c)} className="h-3 w-3" />
          <span className="truncate">{c.name}</span>
        </span>
      ))}
    </span>
  );
}
