import {
  Banknote,
  Boxes,
  ChartColumn,
  ChartSpline,
  ClipboardList,
  DoorOpen,
  Lightbulb,
  Settings2,
  ShoppingBasket,
  Users,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import type { StaffRole } from "@/modules/accounts/auth";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Minimum role; omit for all staff. */
  role?: StaffRole;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const nav: NavGroup[] = [
  {
    label: "Plan",
    items: [
      { title: "Capacity", href: "/capacity", icon: ChartColumn },
      {
        title: "Suggestions",
        href: "/suggestions",
        icon: Lightbulb,
        role: "manager",
      },
      { title: "Forecast", href: "/forecast", icon: ChartSpline },
    ],
  },
  {
    label: "Operate",
    items: [
      { title: "Queue", href: "/queue", icon: DoorOpen },
      { title: "Batches", href: "/batches", icon: Boxes },
      { title: "Bookings", href: "/bookings", icon: ClipboardList },
      { title: "Selling", href: "/selling", icon: Wheat },
      { title: "Rice Buying", href: "/rice-buying", icon: ShoppingBasket },
    ],
  },
  {
    label: "Admin",
    items: [
      {
        title: "Pricing & cost",
        href: "/prices",
        icon: Banknote,
        role: "manager",
      },
      { title: "Clients & staff", href: "/clients", icon: Users },
      {
        title: "Settings",
        href: "/settings",
        icon: Settings2,
        role: "manager",
      },
    ],
  },
];
