"use client";

import {useEffect, useState} from "react";
import {useTranslations, useLocale} from "next-intl";
import Link from "next/link";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Card, CardContent} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Plus, Eye, ShoppingCart, Loader2, Search} from "lucide-react";



interface Transaction {
  id: string;
  buyer_name: string;
  status: string;
  unit_number: string;
  unit_type: string;
  agent_name?: string;
  created_at: string;
  total_price: number;
  eoi_amount?: number;
}

const statusColors: Record<string, string> = {
  eoi: "warning",
  booking_pending: "secondary",
  confirmed: "success",
  cancelled: "destructive",
  terminated: "destructive",
};

const statusBgColors: Record<string, string> = {
  eoi: "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-900/30",
  booking_pending: "bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900/30",
  confirmed: "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900/30",
  cancelled: "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900/30",
  terminated: "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900/30",
};

export default function SalesPage() {
  const t = useTranslations("sales");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const limit = 20;
  const [initialLoad, setInitialLoad] = useState(true);

  async function fetchTransactions(newOffset: number, currentSearch: string, currentStatus: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (currentSearch) params.set("search", currentSearch);
      if (currentStatus) params.set("status", currentStatus);
      params.set("limit", String(limit));
      params.set("offset", String(newOffset));
      const res = await fetch(`/api/transactions?${params.toString()}`);
      const data = await res.json();
      setTransactions(data.transactions || []);
      setTotal(data.total || 0);
      setOffset(newOffset);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  // Handle initial load and filter changes
  useEffect(() => {
    if (initialLoad) {
      setInitialLoad(false);
    }
    fetchTransactions(0, search, statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  }, [search, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground mt-1">Track transactions from EOI to handover</p>
        </div>
        <Link href={`/${locale}/sales/new`}>
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            {t("newTransaction")}
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by buyer or unit..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v || "")}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All statuses</SelectItem>
            <SelectItem value="eoi">{t("eoi")}</SelectItem>
            <SelectItem value="booking_pending">{t("booking_pending")}</SelectItem>
            <SelectItem value="confirmed">{t("confirmed")}</SelectItem>
            <SelectItem value="cancelled">{t("cancelled")}</SelectItem>
            <SelectItem value="terminated">{t("terminated")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : transactions.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ShoppingCart className="h-10 w-10 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground font-medium">No transactions yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Create your first sale to get started</p>
            <Link href={`/${locale}/sales/new`} className="mt-4">
              <Button variant="outline" className="gap-2">
                <Plus className="h-4 w-4" />
                {t("newTransaction")}
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            {transactions.map((tx) => (
              <Card
                key={tx.id}
                className={`hover:shadow-md transition-shadow ${statusBgColors[tx.status] || ""}`}
              >
                <CardContent className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <p className="font-semibold text-base truncate">{tx.buyer_name}</p>
                        <Badge variant={statusColors[tx.status] as any || "secondary"} className="shrink-0">
                          {t(tx.status)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>{tx.unit_number}</span>
                        <span className="text-border">·</span>
                        <span className="capitalize">{tx.unit_type}</span>
                        {tx.agent_name && (
                          <>
                            <span className="text-border">·</span>
                            <span>{tx.agent_name}</span>
                          </>
                        )}
                        <span className="text-border">·</span>
                        <span>{new Date(tx.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <p className="font-semibold">AED {Number(tx.total_price).toLocaleString()}</p>
                        {tx.eoi_amount ? (
                          <p className="text-xs text-muted-foreground">EOI: AED {Number(tx.eoi_amount).toLocaleString()}</p>
                        ) : (
                          <p className="text-xs text-muted-foreground">Total price</p>
                        )}
                      </div>
                      <Link href={`/${locale}/sales/${tx.id}`}>
                        <Button variant="ghost" size="sm" className="gap-1">
                          <Eye className="h-4 w-4" />
                          {tc("view")}
                        </Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {total > limit && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">
                Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => fetchTransactions(offset - limit, search, statusFilter)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset + limit >= total}
                  onClick={() => fetchTransactions(offset + limit, search, statusFilter)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
