"use client";

import {useEffect, useState} from "react";
import {useTranslations, useLocale} from "next-intl";
import Link from "next/link";
import {Button} from "@/components/ui/button";
import {Card, CardContent} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Plus, Users, Loader2, Mail, Phone, Globe} from "lucide-react";

export default function BuyersPage() {
  const t = useTranslations("buyers");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [buyers, setBuyers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBuyers();
  }, []);

  async function fetchBuyers() {
    try {
      const res = await fetch("/api/buyers");
      const data = await res.json();
      setBuyers(data.buyers || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
