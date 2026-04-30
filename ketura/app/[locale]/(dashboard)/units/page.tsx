"use client";

import {useEffect, useState} from "react";
import {useTranslations, useLocale} from "next-intl";
import Link from "next/link";
import {Button} from "@/components/ui/button";
import {Card, CardContent} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Plus, Eye, Pencil, Trash2, Building2, Loader2} from "lucide-react";

const statusColors: Record<string, string> = {
  draft: "secondary",
  available: "default",
  pre_booked: "warning",
  booked: "success",
  handed_over: "outline",
  terminated: "destructive",
};

export default function UnitsPage() {
  const t = useTranslations("units");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUnits();
  }, []);

  async function fetchUnits() {
    try {
      const res = await fetch("/api/units");
      const data = await res.json();
      setUnits(data.units || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function deleteUnit(id: string) {
    if (!confirm(tc("confirm"))) return;
    await fetch(`/api/units/${id}`, {method: "DELETE"});
    fetchUnits();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground mt-1">Manage property units across all projects</p>
        </div>
        <Link href={`/${locale}/units/new`}>
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            {t("newUnit")}
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : units.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground font-medium">No units yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Create your first unit to get started</p>
            <Link href={`/${locale}/units/new`} className="mt-4">
              <Button variant="outline" className="gap-2">
                <Plus className="h-4 w-4" />
                {t("newUnit")}
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {units.map((unit: any) => (
            <Card key={unit.id} className="group hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="font-semibold text-base">{unit.unit_number}</p>
                    <p className="text-sm text-muted-foreground">{unit.project_name || "—"}</p>
                  </div>
                  <Badge variant={statusColors[unit.status] as any || "secondary"} className="shrink-0">
                    {t(unit.status)}
                  </Badge>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("type")}</span>
                    <span className="capitalize">{t(unit.unit_type)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("price")}</span>
                    <span className="font-medium">AED {Number(unit.price).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("area")}</span>
                    <span>{unit.area_sqft ? `${unit.area_sqft.toLocaleString()} sqft` : "—"}</span>
                  </div>
                  {(unit.bedrooms || unit.bathrooms) && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Rooms</span>
                      <span>{unit.bedrooms || 0} bd / {unit.bathrooms || 0} ba</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 pt-3 border-t">
                  <Link href={`/${locale}/units/${unit.id}`}>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Link href={`/${locale}/units/${unit.id}?edit=1`}>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    onClick={() => deleteUnit(unit.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
