import {
  Wallet,
  Banknote,
  Receipt,
  Users,
  Clock,
  AlertTriangle,
  Check,
  ShoppingBag,
  CupSoda,
  Dumbbell,
  Calendar,
  FileText,
  type LucideIcon,
} from "lucide-react";
import { ICON_SET } from "../../lib/domain/manifest";

// Single source of truth: ICON_SET (manifest.ts) defines the allowed names;
// this map is the Lucide side of that contract. They cannot drift independently.
const ICON_MAP: Record<string, LucideIcon> = {
  wallet: Wallet,
  banknote: Banknote,
  receipt: Receipt,
  users: Users,
  clock: Clock,
  alertTriangle: AlertTriangle,
  check: Check,
  shoppingBag: ShoppingBag,
  cupSoda: CupSoda,
  dumbbell: Dumbbell,
  calendar: Calendar,
};

export const NEUTRAL_ICON: LucideIcon = FileText;

export function resolveIcon(name: string | null | undefined): LucideIcon {
  if (name && Object.prototype.hasOwnProperty.call(ICON_MAP, name)) return ICON_MAP[name];
  return NEUTRAL_ICON;
}

// Guard: every declared icon in ICON_SET resolves to a usable Lucide component.
// Lucide icons are forwardRef components (typeof === "object"), so check presence.
export function assertIconCoverage(): boolean {
  return ICON_SET.every((key) => Boolean(ICON_MAP[key]));
}