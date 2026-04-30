"use client";

import {useEffect, useState, useCallback, useRef} from "react";
import {useTranslations, useLocale} from "next-intl";
import Link from "next/link";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Card, CardContent} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {Plus, Eye, Pencil, Trash2, Building2, Loader2, Search} from "lucide-react";
import {toast} from "sonner";



const statusColors: Record<string, string> = {
  draft: "secondary",
  available: "default",
  pre_booked: "warning",
  booked: "success",
  handed_over: "outline",
  terminated: "destructive",
};

interface Unit {
  id: string;
  unit_number: string;
  project_name?: string;
  status: string;
  unit_type: string;
  price: number;
  area_sqft?: number;
  bedrooms?: number;
  bathrooms?: number;
}

interface Project {
  id: string;
  name: string;
}

export default function UnitsPage() {
  const t = useTranslations("units");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [units, setUnits] = useState<Unit[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const limit = 20;
  const filtersRef = useRef({search, statusFilter, projectFilter});
  filtersRef.current = {search, statusFilter, projectFilter};

  const fetchProjects = useCallback(async () => {
    const res = await fetch("/api/projects");
    const data = await res.json();
    setProjects(data.projects || []);
  }, []);

  const fetchUnits = useCallback(async (newOffset: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtersRef.current.search) params.set("search", filtersRef.current.search);
      if (filtersRef.current.statusFilter) params.set("status", filtersRef.current.statusFilter);
      if (filtersRef.current.projectFilter) params.set("projectId", filtersRef.current.projectFilter);
      params.set("limit", String(limit));
      params.set("offset", String(newOffset));
      const res = await fetch(`/api/units?${params.toString()}`);
      const data = await res.json();
      setUnits(data.units || []);
      setTotal(data.total || 0);
      setOffset(newOffset);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchProjects();
    fetchUnits(0);
  }, [fetchProjects, fetchUnits]);

  // Reset and fetch when filters change
  const prevFiltersRef = useRef({search, statusFilter, projectFilter});
  useEffect(() => {
    const prev = prevFiltersRef.current;
    if (prev.search !== search || prev.statusFilter !== statusFilter || prev.projectFilter !== projectFilter) {
      prevFiltersRef.current = {search, statusFilter, projectFilter};
      requestAnimationFrame(() => {
        setOffset(0);
        fetchUnits(0);
      });
    }
  }, [search, statusFilter, projectFilter, fetchUnits]);

  async function deleteUnit(id: string) {
    if (!confirm(tc("confirm"))) return;
    try {
      const res = await fetch(`/api/units/${id}`, {method: "DELETE"});
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || tc("error"));
        return;
      }
      fetchUnits(offset);
    } catch {
      toast.error(tc("error"));
    }
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

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by unit number or project..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v || "")}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All statuses</SelectItem>
            <SelectItem value="draft">{t("draft")}</SelectItem>
            <SelectItem value="available">{t("available")}</SelectItem>
            <SelectItem value="pre_booked">{t("pre_booked")}</SelectItem>
            <SelectItem value="booked">{t("booked")}</SelectItem>
            <SelectItem value="handed_over">{t("handed_over")}</SelectItem>
            <SelectItem value="terminated">{t("terminated")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={projectFilter} onValueChange={(v) => setProjectFilter(v || "")}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All projects">{projects.find((p) => p.id === projectFilter)?.name || "All projects"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {units.map((unit) => (
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
                  onClick={() => fetchUnits(offset - limit)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset + limit >= total}
                  onClick={() => fetchUnits(offset + limit)}
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
