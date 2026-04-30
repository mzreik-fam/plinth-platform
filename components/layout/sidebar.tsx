"use client";

import {useEffect, useState} from "react";
import {useTranslations, useLocale} from "next-intl";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {Button} from "@/components/ui/button";
import {Sheet, SheetContent, SheetTrigger} from "@/components/ui/sheet";
import {ThemeToggle} from "@/components/layout/theme-toggle";
import {LocaleSwitcher} from "@/components/layout/locale-switcher";
import {
  LayoutDashboard,
  Building2,
  ShoppingCart,
  Users,
  UserCircle,
  Menu,
  LogOut,
  KeyRound,
  AlertTriangle,
  ClipboardCheck,
  Bell,
  ChevronRight,
  FolderKanban,
  CalendarDays,
} from "lucide-react";

const mainNavItems = [
  {key: "dashboard", href: "", icon: LayoutDashboard},
  {key: "projects", href: "/projects", icon: FolderKanban},
  {key: "units", href: "/units", icon: Building2},
  {key: "sales", href: "/sales", icon: ShoppingCart},
  {key: "buyers", href: "/buyers", icon: Users},
  {key: "payment_plans", href: "/payment-plans", icon: CalendarDays},
];

const processNavItems = [
  {key: "handovers", href: "/handovers", icon: KeyRound},
  {key: "terminations", href: "/terminations", icon: AlertTriangle},
  {key: "approvals", href: "/approvals", icon: ClipboardCheck},
];

const adminNavItems = [
  {key: "users", href: "/users", icon: UserCircle},
];

export function Sidebar() {
  const t = useTranslations("navigation");
  const locale = useLocale();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    // Cache user in sessionStorage to avoid refetching on every navigation
    const cachedUser = sessionStorage.getItem("plinth_user");
    if (cachedUser) {
      try { setUser(JSON.parse(cachedUser)); } catch {}
    } else {
      fetch("/api/users/me")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.user) {
            setUser(data.user);
            sessionStorage.setItem("plinth_user", JSON.stringify(data.user));
          }
        })
        .catch(() => {});
    }

    fetch("/api/notifications?unread=true")
      .then((r) => (r.ok ? r.json() : {notifications: []}))
      .then((data) => {
        setUnreadCount(data.notifications?.length || 0);
      })
      .catch(() => {});
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", {method: "POST"});
    window.location.href = `/${locale}/login`;
  }

  const isActive = (href: string) => {
    const fullPath = `/${locale}${href}`;
    if (href === "") {
      return pathname === fullPath || pathname === `/${locale}`;
    }
    return pathname === fullPath || pathname.startsWith(fullPath + "/");
  };

  function NavItem({item, onClick}: {item: {key: string; href: string; icon: any}; onClick?: () => void}) {
    const Icon = item.icon;
    const active = isActive(item.href);
    const href = `/${locale}${item.href}`;

    return (
      <Link
        key={item.key}
        href={href}
        onClick={onClick}
        className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
          active
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
        }`}
      >
        <Icon className={`h-[18px] w-[18px] transition-colors ${active ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"}`} />
        <span className="flex-1">{t(item.key)}</span>
        {active && <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
      </Link>
    );
  }

  function NavSection({title, items, onItemClick}: {title?: string; items: typeof mainNavItems; onItemClick?: () => void}) {
    return (
      <div className="space-y-0.5">
        {title && (
          <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            {title}
          </p>
        )}
        {items.map((item) => (
          <NavItem key={item.key} item={item} onClick={onItemClick} />
        ))}
      </div>
    );
  }

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-[260px] border-r bg-card/50 backdrop-blur-sm h-screen sticky top-0">
        {/* Logo */}
        <div className="px-5 pt-6 pb-4">
          <Link href={`/${locale}`} className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-sm">
              <Building2 className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight tracking-tight">Plinth</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Platform</p>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 space-y-5 overflow-y-auto">
          <NavSection items={mainNavItems} />
          <NavSection title="Workflows" items={processNavItems} />
          <NavSection title="Admin" items={adminNavItems} />
        </nav>

        {/* Bottom Actions */}
        <div className="p-3 border-t space-y-3">
          {/* Quick Actions */}
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <LocaleSwitcher />
            <Link href={`/${locale}/approvals`} className="flex-1">
              <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-xs h-8 px-2 relative">
                <Bell className="h-3.5 w-3.5" />
                <span className="flex-1 text-left">{t("approvals")}</span>
                {unreadCount > 0 && (
                  <span className="bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full h-4 min-w-4 px-1 flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </Button>
            </Link>
          </div>

          {/* User Card */}
          {user && (
            <Link href={`/${locale}/profile`} className="block">
              <div className="p-3 rounded-xl bg-muted/60 border hover:bg-muted/80 transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-primary">
                      {user.full_name?.charAt(0)?.toUpperCase() || "U"}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{user.full_name}</p>
                    <p className="text-[11px] text-muted-foreground capitalize">{user.role?.replace(/_/g, " ")}</p>
                  </div>
                </div>
              </div>
            </Link>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/5"
            onClick={logout}
          >
            <LogOut className="h-3.5 w-3.5" />
            {t("logout")}
          </Button>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <Link href={`/${locale}`} className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
            <Building2 className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-base">Plinth</span>
        </Link>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <LocaleSwitcher />
          <Link href={`/${locale}/approvals`}>
            <Button variant="ghost" size="icon" className="relative h-8 w-8">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-destructive text-destructive-foreground text-[9px] font-bold rounded-full h-3.5 w-3.5 flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </Button>
          </Link>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side={locale === "ar" ? "right" : "left"} className="w-[280px] p-0">
              <div className="flex flex-col h-full">
                <div className="px-5 pt-6 pb-4 border-b">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <div>
                      <h1 className="text-lg font-bold leading-tight">Plinth</h1>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Platform</p>
                    </div>
                  </div>
                </div>
                <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
                  <NavSection items={mainNavItems} onItemClick={() => setMobileOpen(false)} />
                  <NavSection title="Workflows" items={processNavItems} onItemClick={() => setMobileOpen(false)} />
                  <NavSection title="Admin" items={adminNavItems} onItemClick={() => setMobileOpen(false)} />
                </nav>
                <div className="p-4 border-t space-y-3">
                  {user && (
                    <div className="flex items-center gap-3 px-1">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-primary">
                          {user.full_name?.charAt(0)?.toUpperCase() || "U"}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{user.full_name}</p>
                        <p className="text-[11px] text-muted-foreground capitalize">{user.role?.replace(/_/g, " ")}</p>
                      </div>
                    </div>
                  )}
                  <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-destructive" onClick={logout}>
                    <LogOut className="h-4 w-4 mr-2" />
                    {t("logout")}
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>
    </>
  );
}
