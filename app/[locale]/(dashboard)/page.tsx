"use client";

import {useEffect, useState, ComponentType} from "react";
import {useTranslations} from "next-intl";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";


import {
  Building2,
  ShoppingCart,
  CreditCard,
  TrendingUp,
  KeyRound,
  AlertTriangle,
  ClipboardCheck,
  Clock,
  Bell,
  AlertCircle,
  CheckCircle2,
  Package,
} from "lucide-react";

interface DashboardStats {
  notifications?: {unread?: number};
  units?: {
    available?: number;
    pre_booked?: number;
    booked?: number;
    total?: number;
    handed_over?: number;
    terminated?: number;
    draft?: number;
  };
  sales?: {
    eoi_pipeline?: number;
    total_revenue?: number;
    eoi_count?: number;
    booking_pending_count?: number;
    confirmed_count?: number;
    cancelled_count?: number;
  };
  pendingApprovals?: number;
  activeHandovers?: number;
  activeTerminations?: number;
  openSnagging?: number;
  upcomingPayments?: number;
  penalties?: {
    count?: number;
    total?: number;
  };
}

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((r) => r.json())
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const notifications = stats?.notifications;
  const units = stats?.units;
  const sales = stats?.sales;
  const penalties = stats?.penalties;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        {notifications?.unread ? (
          <Badge variant="destructive" className="gap-1">
            <Bell className="h-3 w-3" />
            {notifications.unread} unread
          </Badge>
        ) : null}
      </div>

      {/* Unit Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Available Units"
          value={units?.available ?? 0}
          icon={Building2}
          description="Ready for sale"
        />
        <StatCard
          title="Pre-Booked"
          value={units?.pre_booked ?? 0}
          icon={ShoppingCart}
          description="EOI received"
          trend={sales?.eoi_pipeline ? `AED ${Number(sales.eoi_pipeline).toLocaleString()}` : undefined}
        />
        <StatCard
          title="Booked"
          value={units?.booked ?? 0}
          icon={CreditCard}
          description="Confirmed sales"
        />
        <StatCard
          title="Total Revenue"
          value={`AED ${Number(sales?.total_revenue ?? 0).toLocaleString()}`}
          icon={TrendingUp}
          description="Confirmed transactions"
          highlight
        />
      </div>

      {/* Operational Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Pending Approvals"
          value={stats?.pendingApprovals ?? 0}
          icon={ClipboardCheck}
          description="Units awaiting review"
          alert={!!stats?.pendingApprovals}
        />
        <StatCard
          title="Active Handovers"
          value={stats?.activeHandovers ?? 0}
          icon={KeyRound}
          description="In progress"
        />
        <StatCard
          title="Active Terminations"
          value={stats?.activeTerminations ?? 0}
          icon={AlertTriangle}
          description="DLD process active"
          alert={!!stats?.activeTerminations}
        />
        <StatCard
          title="Open Snagging"
          value={stats?.openSnagging ?? 0}
          icon={Package}
          description="Tickets to resolve"
          alert={!!stats?.openSnagging}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Sales Pipeline */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              {t("salesPipeline")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <PipelineRow label="EOI" value={sales?.eoi_count ?? 0} color="bg-yellow-500" />
            <PipelineRow label="Booking Pending" value={sales?.booking_pending_count ?? 0} color="bg-blue-500" />
            <PipelineRow label="Confirmed" value={sales?.confirmed_count ?? 0} color="bg-green-500" />
            <PipelineRow label="Cancelled" value={sales?.cancelled_count ?? 0} color="bg-red-500" />
            <div className="pt-2 border-t">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Pipeline Value</span>
                <span className="font-semibold">AED {Number(sales?.eoi_pipeline ?? 0).toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payments Due */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              {t("paymentsDue")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center py-4">
              <p className="text-4xl font-bold">{stats?.upcomingPayments ?? 0}</p>
              <p className="text-sm text-muted-foreground mt-1">Upcoming payment installments</p>
            </div>
            {penalties?.count ? (
              <div className="p-3 bg-destructive/10 rounded-lg">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">{penalties.count} Active Penalties</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Total: AED {Number(penalties.total ?? 0).toLocaleString()}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Quick Status Overview */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              Portfolio Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <StatusRow label="Total Units" value={units?.total ?? 0} />
            <StatusRow label="Handed Over" value={units?.handed_over ?? 0} />
            <StatusRow label="Terminated" value={units?.terminated ?? 0} />
            <StatusRow label="Draft" value={units?.draft ?? 0} />
            <div className="pt-2 border-t">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Occupancy Rate</span>
                <span className="font-semibold">
                  {(units?.total ?? 0) > 0
                    ? Math.round((((units?.booked ?? 0) + (units?.handed_over ?? 0)) / (units?.total ?? 1)) * 100)
                    : 0}%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({title, value, icon: Icon, description, trend, highlight, alert}: {
  title: string; value: string | number; icon: ComponentType<{className?: string}>; description?: string; trend?: string; highlight?: boolean; alert?: boolean;
}) {
  return (
    <Card className={highlight ? "border-primary/50" : ""}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className={`text-2xl font-bold ${alert ? "text-destructive" : ""}`}>{value}</p>
            {trend && <p className="text-xs text-muted-foreground">{trend}</p>}
            {description && !trend && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          <div className={`p-2 rounded-lg ${alert ? "bg-destructive/10" : "bg-muted"}`}>
            <Icon className={`h-5 w-5 ${alert ? "text-destructive" : "text-muted-foreground"}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PipelineRow({label, value, color}: {label: string; value: number; color: string}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{width: `${value > 0 ? 100 : 0}%`}} />
      </div>
    </div>
  );
}

function StatusRow({label, value}: {label: string; value: number}) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
