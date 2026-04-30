"use client";

import {useEffect, useState} from "react";
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

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const [stats, setStats] = useState<any>(null);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        {stats?.notifications?.unread > 0 && (
          <Badge variant="destructive" className="gap-1">
            <Bell className="h-3 w-3" />
            {stats.notifications.unread} unread
          </Badge>
        )}
      </div>

      {/* Unit Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Available Units"
          value={stats?.units?.available || 0}
          icon={Building2}
          description="Ready for sale"
        />
        <StatCard
          title="Pre-Booked"
          value={stats?.units?.pre_booked || 0}
          icon={ShoppingCart}
          description="EOI received"
          trend={stats?.sales?.eoi_pipeline > 0 ? `AED ${Number(stats.sales.eoi_pipeline).toLocaleString()}` : undefined}
        />
        <StatCard
          title="Booked"
          value={stats?.units?.booked || 0}
          icon={CreditCard}
          description="Confirmed sales"
        />
        <StatCard
          title="Total Revenue"
          value={`AED ${Number(stats?.sales?.total_revenue || 0).toLocaleString()}`}
          icon={TrendingUp}
          description="Confirmed transactions"
          highlight
        />
      </div>

      {/* Operational Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Pending Approvals"
          value={stats?.pendingApprovals || 0}
          icon={ClipboardCheck}
          description="Units awaiting review"
          alert={stats?.pendingApprovals > 0}
        />
        <StatCard
          title="Active Handovers"
          value={stats?.activeHandovers || 0}
          icon={KeyRound}
          description="In progress"
        />
        <StatCard
          title="Active Terminations"
          value={stats?.activeTerminations || 0}
          icon={AlertTriangle}
          description="DLD process active"
          alert={stats?.activeTerminations > 0}
        />
        <StatCard
          title="Open Snagging"
          value={stats?.openSnagging || 0}
          icon={Package}
          description="Tickets to resolve"
          alert={stats?.openSnagging > 0}
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
            <PipelineRow label="EOI" value={stats?.sales?.eoi_count || 0} color="bg-yellow-500" stats={stats} />
            <PipelineRow label="Booking Pending" value={stats?.sales?.booking_pending_count || 0} color="bg-blue-500" stats={stats} />
            <PipelineRow label="Confirmed" value={stats?.sales?.confirmed_count || 0} color="bg-green-500" stats={stats} />
            <PipelineRow label="Cancelled" value={stats?.sales?.cancelled_count || 0} color="bg-red-500" stats={stats} />
            <div className="pt-2 border-t">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Pipeline Value</span>
                <span className="font-semibold">AED {Number(stats?.sales?.eoi_pipeline || 0).toLocaleString()}</span>
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
              <p className="text-4xl font-bold">{stats?.upcomingPayments || 0}</p>
              <p className="text-sm text-muted-foreground mt-1">Upcoming payment installments</p>
            </div>
            {stats?.penalties?.count > 0 && (
              <div className="p-3 bg-destructive/10 rounded-lg">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">{stats.penalties.count} Active Penalties</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Total: AED {Number(stats.penalties.total).toLocaleString()}
                </p>
              </div>
            )}
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
            <StatusRow label="Total Units" value={stats?.units?.total || 0} />
            <StatusRow label="Handed Over" value={stats?.units?.handed_over || 0} />
            <StatusRow label="Terminated" value={stats?.units?.terminated || 0} />
            <StatusRow label="Draft" value={stats?.units?.draft || 0} />
            <div className="pt-2 border-t">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Occupancy Rate</span>
                <span className="font-semibold">
                  {Number(stats?.units?.total || 0) > 0
                    ? Math.round(((Number(stats.units.booked || 0) + Number(stats.units.handed_over || 0)) / Number(stats.units.total)) * 100)
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
  title: string; value: string | number; icon: any; description?: string; trend?: string; highlight?: boolean; alert?: boolean;
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

function PipelineRow({label, value, color, stats}: {label: string; value: number; color: string; stats: any}) {
  const total = (stats?.sales?.eoi_count || 0) + (stats?.sales?.booking_pending_count || 0) + (stats?.sales?.confirmed_count || 0) + (stats?.sales?.cancelled_count || 0);
  const width = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{width: `${width}%`}} />
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
