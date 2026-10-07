import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { AdminConsole, TABS, type Tab } from "@/components/AdminConsole";
import { DashboardHome } from "@/components/DashboardHome";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  BadgeCheck,
  Building2,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  FileClock,
  Gauge,
  HandCoins,
  Headphones,
  Landmark,
  LogOut,
  Menu,
  ReceiptText,
  Settings,
  ShieldCheck,
  UserRound,
  WalletCards,
  Bell,
  Users,
  MessageSquare,
  History, DoorClosed, Flag, FileSpreadsheet, UserCog,
  Scale,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
import { Logo } from "@/components/AuthShell";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { getMe, logout } from "@/lib/auth.functions";
import { getUnreadCount } from "@/lib/banking.functions";
import { cn } from "@/lib/utils";

type Me = Awaited<ReturnType<typeof getMe>>;
type MenuItem = { label: string; icon: ComponentType<{ className?: string }>; active?: boolean; to?: "/account" | "/accounts" | "/cards" | "/local-transfer" | "/wire" | "/transactions" | "/statements" | "/beneficiaries" | "/receive" | "/notifications" | "/settings" | "/send" | "/loan-request" | "/convert" | "/tax-refund" | "/loan-history" | "/support-ticket" | "/standing-orders" };

const menuGroups: Array<{ label: string; items: MenuItem[] }> = [
  {
    label: "Main Menu",
    items: [
      { label: "Dashboard", icon: Gauge, active: true, to: "/account" },
      { label: "Accounts", icon: WalletCards, to: "/accounts" },
      { label: "Transactions", icon: ReceiptText, to: "/transactions" },
      { label: "Cards", icon: CreditCard, to: "/cards" },
      { label: "Send Money", icon: ArrowLeftRight, to: "/send" },
      { label: "Standing Orders", icon: FileClock, to: "/standing-orders" },
      { label: "Local Transfer", icon: HandCoins, to: "/local-transfer" },
      { label: "International Wire", icon: Building2, to: "/wire" },
      { label: "Receive", icon: ArrowDownToLine, to: "/receive" },
      { label: "Statements", icon: FileClock, to: "/statements" },
      { label: "Beneficiaries", icon: UserRound, to: "/beneficiaries" },
    ],
  },
  {
    label: "Services",
    items: [
      { label: "Loan Request", icon: CircleDollarSign, to: "/loan-request" },
      { label: "IRS Tax Refund", icon: Landmark, to: "/tax-refund" },
      { label: "Loan History", icon: FileClock, to: "/loan-history" },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Notifications", icon: Bell, to: "/notifications" },
      { label: "Settings", icon: Settings, to: "/settings" },
      { label: "Support Ticket", icon: Headphones, to: "/support-ticket" },
    ],
  },
];

function initialsFor(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "UC";
}


function MenuItems() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="space-y-7" aria-label="Account navigation">
      {menuGroups.map((group) => (
        <div key={group.label}>
          <p className="mb-2 px-3 text-xs font-semibold uppercase text-muted-foreground">{group.label}</p>
          <div className="space-y-1">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = item.to ? pathname === item.to || pathname.startsWith(`${item.to}/`) : item.active;
              return (
                item.to ? (
                  <Button key={item.label} asChild variant="ghost" className={cn("min-h-11 w-full justify-start gap-3 px-3 font-normal", active && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground")}>
                    <Link to={item.to}><Icon className="size-4" /><span>{item.label}</span></Link>
                  </Button>
                ) : <Button
                  key={item.label}
                  type="button"
                  variant="ghost"
                  className={cn(
                    "min-h-11 w-full justify-start gap-3 px-3 font-normal",
                    active && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className="size-4" />
                  <span>{item.label}</span>
                </Button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function UserMenu({ me, onLogout }: { me: NonNullable<Me>; onLogout: () => Promise<void> }) {
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);

  useEffect(() => {
    let currentUrl: string | null = null;
    let cancelled = false;

    const loadAvatar = async () => {
      const response = await fetch("/api/avatar", { cache: "no-store" });
      if (cancelled) return;
      if (!response.ok) {
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        currentUrl = null;
        setAvatarSrc(null);
        return;
      }
      const nextUrl = URL.createObjectURL(await response.blob());
      if (cancelled) {
        URL.revokeObjectURL(nextUrl);
        return;
      }
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      currentUrl = nextUrl;
      setAvatarSrc(nextUrl);
    };

    void loadAvatar();
    const handleChange = () => { void loadAvatar(); };
    window.addEventListener("profile-avatar-changed", handleChange);
    return () => {
      cancelled = true;
      window.removeEventListener("profile-avatar-changed", handleChange);
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, []);

  const avatar = (className: string) => (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden rounded-full bg-primary text-sm font-semibold text-primary-foreground", className)}>
      {avatarSrc ? <img src={avatarSrc} alt="" className="h-full w-full object-cover" /> : initialsFor(me.fullName)}
    </span>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="flex items-center gap-2 rounded-full px-1 py-1 hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Open user menu"
        >
          {avatar("size-11")}
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 overflow-hidden p-0">
        <div className="bg-muted/50 px-4 py-5">
          <div className="flex items-center gap-3">
            {avatar("size-12 ring-2 ring-primary/15")}
            <div className="min-w-0">
              <p className="truncate font-sans text-sm font-semibold leading-tight">{me.fullName}</p>
              <p className="truncate text-xs text-muted-foreground">{me.email}</p>
            </div>
          </div>
          {me.isAdmin && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
              <ShieldCheck className="size-3" aria-hidden /> Administrator
            </p>
          )}
        </div>
        <div className="space-y-0.5 p-1.5">
          <DropdownMenuItem asChild className="min-h-10 gap-2.5 rounded-md px-2.5">
            <Link to="/kyc"><BadgeCheck className="size-4 text-muted-foreground" /> Verify KYC <ChevronRight className="ml-auto size-4 text-muted-foreground" /></Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="min-h-10 gap-2.5 rounded-md px-2.5">
            <Link to="/profile"><UserRound className="size-4 text-muted-foreground" /> Profile <ChevronRight className="ml-auto size-4 text-muted-foreground" /></Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="my-1.5" />
          <DropdownMenuItem className="min-h-10 gap-2.5 rounded-md px-2.5 text-destructive focus:text-destructive" onSelect={() => { void onLogout(); }}>
            <LogOut className="size-4" /> Logout
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationBell() {
  const fetchUnread = useServerFn(getUnreadCount);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { unread: n } = await fetchUnread();
        if (!cancelled) setUnread(n);
      } catch { /* keep last count */ }
    };
    void load();
    const interval = window.setInterval(load, 30000);
    const handleChange = () => { void load(); };
    window.addEventListener("notifications-changed", handleChange);
    window.addEventListener("focus", handleChange);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("notifications-changed", handleChange);
      window.removeEventListener("focus", handleChange);
    };
  }, [fetchUnread]);

  return (
    <Button asChild type="button" variant="ghost" size="icon" className="relative h-11 w-11 rounded-full" aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}>
      <Link to="/notifications">
        <Bell className="size-5" aria-hidden />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-[11px] font-semibold leading-none text-destructive-foreground">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Link>
    </Button>
  );
}

const ADMIN_ICONS: Record<Tab, ComponentType<{ className?: string }>> = {
  Overview: Gauge, Customers: Users, KYC: BadgeCheck, Transactions: ReceiptText, Loans: CircleDollarSign, Adjustments: Scale, Holds: Lock, "Tax refunds": Landmark, Cards: CreditCard, Closures: DoorClosed, Disputes: Flag, Support: Headphones, Messages: MessageSquare, Reports: FileSpreadsheet, Staff: UserCog, Activity: History, Settings,
};

function AdminMenu({ tab, setTab, mobile }: { tab: Tab; setTab: (t: Tab) => void; mobile: boolean }) {
  return (
    <nav aria-label="Admin navigation">
      <p className="mb-2 px-3 text-xs font-semibold uppercase text-muted-foreground">Admin Control</p>
      <div className="space-y-1">
        {TABS.map((t) => {
          const Icon = ADMIN_ICONS[t];
          const btn = (
            <Button key={t} type="button" variant="ghost" onClick={() => setTab(t)} aria-current={tab === t ? "page" : undefined}
              className={cn("min-h-11 w-full justify-start gap-3 px-3 font-normal", tab === t && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground")}>
              <Icon className="size-4" /><span>{t === "KYC" ? "KYC Reviews" : t}</span>
            </Button>
          );
          return mobile ? <SheetClose key={t} asChild>{btn}</SheetClose> : btn;
        })}
      </div>
    </nav>
  );
}

function Sidebar({ me, mobile = false, nav }: { me: NonNullable<Me>; mobile?: boolean; nav?: ReactNode }) {
  void me;
  return (
    <div className={cn("flex h-full flex-col", mobile ? "px-1" : "px-5 py-6")}>
      <div className="mb-7"><Logo /></div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">{nav ?? <MenuItems />}</div>
    </div>
  );
}

export function DashboardShell({ me, onLogout, title, subtitle, actions, wide = true, kicker = "Online Banking", mobileNav, children }: { me: NonNullable<Me>; onLogout: () => Promise<void>; title: string; subtitle?: string | undefined; actions?: ReactNode; wide?: boolean | undefined; kicker?: string; mobileNav?: ReactNode; children: ReactNode }) {
  return (
    <main className="min-w-0 flex-1 bg-muted/40 print:bg-background">
      <header className="flex min-h-20 flex-wrap items-center gap-y-3 border-b bg-background px-4 py-3 sm:px-8 print:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button type="button" variant="outline" size="icon" className="mr-3 h-11 w-11 shrink-0 lg:hidden" aria-label="Open menu">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[min(19rem,calc(100vw-2.5rem))] p-4 sm:max-w-[19rem] sm:p-5">
            <SheetHeader className="sr-only">
              <SheetTitle>Menu</SheetTitle>
              <SheetDescription>Dashboard navigation.</SheetDescription>
            </SheetHeader>
            <Sidebar me={me} mobile nav={mobileNav} />
          </SheetContent>
        </Sheet>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase text-primary">{kicker}</p>
          <h1 className="truncate text-2xl sm:text-3xl">{title}</h1>
        </div>
        {actions && <div className="order-last flex w-full min-w-0 justify-end max-sm:[&:has([data-header-action-mobile-hidden])]:hidden sm:order-none sm:ml-auto sm:w-auto">{actions}</div>}
        <div className="flex shrink-0 items-center gap-3">
          <NotificationBell />
          <UserMenu me={me} onLogout={onLogout} />
        </div>
      </header>

      <div className={`mx-auto px-4 py-8 sm:px-8 sm:py-10 print:max-w-none print:p-0 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
        {subtitle && <p className="mb-6 text-sm text-muted-foreground print:hidden">{subtitle}</p>}
        {children}
      </div>
    </main>
  );
}

export function SignedInShell({ title, subtitle, actions, wide, children }: { title: string; subtitle?: string | undefined; actions?: ReactNode; wide?: boolean | undefined; children: ReactNode }) {
  const fetchMe = useServerFn(getMe);
  const doLogout = useServerFn(logout);
  const navigate = useNavigate();
  const [me, setMe] = useState<Me | undefined>(undefined);

  useEffect(() => {
    fetchMe().then((user) => {
      if (!user) navigate({ to: "/login", replace: true });
      else setMe(user);
    });
  }, [fetchMe, navigate]);

  if (!me) return <div className="grid min-h-screen place-items-center text-muted-foreground">Loading…</div>;

  const handleLogout = async () => {
    await doLogout();
    navigate({ to: "/login", replace: true });
  };

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden h-screen w-72 shrink-0 border-r bg-background lg:sticky lg:top-0 lg:block print:hidden">
        <Sidebar me={me} />
      </aside>
      <DashboardShell me={me} onLogout={handleLogout} title={title} subtitle={subtitle} actions={actions} wide={wide}>
        {me.isDemo && (
          <div role="status" className="mb-6 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm font-medium text-destructive">
            Demo account – fictional funds. Balances and transactions shown here are not real money and cannot be sent outside this demo.
          </div>
        )}
        {children}
      </DashboardShell>
    </div>
  );
}

export function SignedIn({ requireAdmin = false }: { requireAdmin?: boolean }) {
  const fetchMe = useServerFn(getMe);
  const doLogout = useServerFn(logout);
  const navigate = useNavigate();
  const [me, setMe] = useState<Me | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("Overview");

  useEffect(() => {
    fetchMe().then((user) => {
      if (!user || (requireAdmin && !user.isAdmin)) navigate({ to: requireAdmin ? "/admin/login" : "/login", replace: true });
      else setMe(user);
    });
  }, [fetchMe, navigate, requireAdmin]);

  if (!me) return <div className="grid min-h-screen place-items-center text-muted-foreground">Loading…</div>;

  const handleLogout = async () => {
    await doLogout();
    navigate({ to: requireAdmin ? "/admin/login" : "/login", replace: true });
  };

  if (requireAdmin) {
    const nav = (mobile: boolean) => <AdminMenu tab={tab} setTab={setTab} mobile={mobile} />;
    return (
      <div className="flex min-h-screen bg-background">
        <aside className="hidden h-screen w-72 shrink-0 border-r bg-background lg:sticky lg:top-0 lg:block">
          <Sidebar me={me} nav={nav(false)} />
        </aside>
        <DashboardShell me={me} onLogout={handleLogout} title={tab} kicker="Administrator" mobileNav={nav(true)}>
          <AdminConsole tab={tab} setTab={setTab} />
        </DashboardShell>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden h-screen w-72 shrink-0 border-r bg-background lg:sticky lg:top-0 lg:block">
        <Sidebar me={me} />
      </aside>
      <DashboardShell me={me} onLogout={handleLogout} title="Dashboard">
        <DashboardHome />
      </DashboardShell>
    </div>
  );
}
