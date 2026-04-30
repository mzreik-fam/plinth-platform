"use client";

import {useEffect, useState} from "react";
import {useTranslations, useLocale} from "next-intl";
import Link from "next/link";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Card, CardContent} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Plus, Users, Loader2, Mail, Phone, Globe, Search, ShoppingCart, Pencil, Trash2} from "lucide-react";
import {toast} from "sonner";



export default function BuyersPage() {
  const t = useTranslations("buyers");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [buyers, setBuyers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const limit = 20;

  useEffect(() => {
    setOffset(0);
    fetchBuyers(0);
  }, [search]);

  async function fetchBuyers(newOffset: number) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      params.set("limit", String(limit));
      params.set("offset", String(newOffset));
      const res = await fetch(`/api/buyers?${params.toString()}`);
      const data = await res.json();
      setBuyers(data.buyers || []);
      setTotal(data.total || 0);
      setOffset(newOffset);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function deleteBuyer(id: string) {
    if (!confirm("Are you sure you want to delete this buyer?")) return;
    try {
      const res = await fetch(`/api/buyers/${id}`, {method: "DELETE"});
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to delete buyer");
        return;
      }
      fetchBuyers(offset);
      toast.success("Buyer deleted");
    } catch {
      toast.error("Failed to delete buyer");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground mt-1">Manage buyers and their contact information</p>
        </div>
        <Link href={`/${locale}/buyers/new`}>
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            {t("newBuyer")}
          </Button>
        </Link>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, phone, or Emirates ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 max-w-md"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : buyers.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="h-10 w-10 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground font-medium">No buyers yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Add your first buyer to get started</p>
            <Link href={`/${locale}/buyers/new`} className="mt-4">
              <Button variant="outline" className="gap-2">
                <Plus className="h-4 w-4" />
                {t("newBuyer")}
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {buyers.map((buyer: any) => (
              <Card key={buyer.id} className="group hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-primary">
                        {buyer.full_name?.charAt(0)?.toUpperCase() || "?"}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-base truncate">{buyer.full_name}</p>
                      {buyer.nationality && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Globe className="h-3 w-3" />
                          <span>{buyer.nationality}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground/60" />
                      <span>{buyer.phone}</span>
                    </div>
                    {buyer.email && (
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground/60" />
                        <span className="truncate">{buyer.email}</span>
                      </div>
                    )}
                    {buyer.emirates_id && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{t("emiratesId")}</span>
                        <span className="font-mono text-xs">{buyer.emirates_id}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t mt-3">
                    <Link href={`/${locale}/sales?buyerId=${buyer.id}`}>
                      <Button variant="ghost" size="sm" className="gap-1">
                        <ShoppingCart className="h-3.5 w-3.5" />
                        View Transactions
                      </Button>
                    </Link>
                    <div className="flex items-center gap-1">
                      <Link href={`/${locale}/buyers/${buyer.id}`}>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => deleteBuyer(buyer.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
                  onClick={() => fetchBuyers(offset - limit)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset + limit >= total}
                  onClick={() => fetchBuyers(offset + limit)}
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
