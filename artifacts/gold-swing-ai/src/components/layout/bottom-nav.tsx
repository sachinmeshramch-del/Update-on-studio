import { Link, useLocation } from "wouter";
import { LayoutDashboard, BarChart3, Database, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    path: "/",
    icon: LayoutDashboard,
  },
  {
    id: "backtest",
    label: "Backtest",
    path: "/backtest",
    icon: BarChart3,
  },
  {
    id: "data",
    label: "Data",
    path: "/data",
    icon: Database,
  },
  {
    id: "more",
    label: "More",
    path: "/more",
    icon: MoreHorizontal,
  },
];

export function BottomNav() {
  const [location] = useLocation();

  const isCurrentActive = (itemPath: string) => {
    if (itemPath === "/") {
      return location === "/" || location === "";
    }
    if (itemPath === "/more") {
      return location === "/more" || location === "/settings" || location === "/diagnostics";
    }
    return location.startsWith(itemPath);
  };

  return (
    <nav
      aria-label="Bottom Navigation"
      className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-950/95 dark:bg-zinc-950/95 backdrop-blur-md border-t border-border/80 shadow-[0_-4px_20px_rgba(0,0,0,0.5)] transition-all"
    >
      <div className="max-w-md mx-auto sm:max-w-xl md:max-w-2xl px-2">
        <div className="grid grid-cols-4 h-14 sm:h-16 items-center">
          {NAV_ITEMS.map((item) => {
            const active = isCurrentActive(item.path);
            const Icon = item.icon;

            return (
              <Link
                key={item.id}
                href={item.path}
                className={cn(
                  "flex flex-col items-center justify-center h-full w-full relative transition-all duration-200 select-none cursor-pointer group",
                  active
                    ? "text-amber-500 font-semibold"
                    : "text-muted-foreground hover:text-foreground font-medium"
                )}
              >
                {/* Active indicator bar at top of button */}
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 sm:w-12 h-0.5 bg-gradient-to-r from-amber-400 to-amber-600 rounded-full shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
                )}

                <div
                  className={cn(
                    "flex items-center justify-center p-1 rounded-xl transition-all duration-200",
                    active
                      ? "bg-amber-500/10 scale-105"
                      : "group-hover:bg-accent/40"
                  )}
                >
                  <Icon
                    className={cn(
                      "w-5 h-5 transition-transform duration-200",
                      active ? "stroke-[2.2] scale-105" : "stroke-[1.8]"
                    )}
                  />
                </div>

                <span
                  className={cn(
                    "text-[10px] sm:text-[11px] tracking-tight leading-none mt-0.5 transition-colors",
                    active ? "text-amber-500" : "text-muted-foreground"
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
