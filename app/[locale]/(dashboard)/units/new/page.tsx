"use client";

import {useState, useEffect} from "react";
import {useTranslations, useLocale} from "next-intl";
import {useRouter} from "next/navigation";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {ArrowLeft, Loader2} from "lucide-react";
import Link from "next/link";
import {toast} from "sonner";



export default function NewUnitPage() {
  const t = useTranslations("units");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [projects, setProjects] = useState<any[]>([]);
  const [form, setForm] = useState({
    projectId: "",
    unitNumber: "",
    unitType: "apartment",
    bedrooms: "",
    bathrooms: "",
    areaSqft: "",
    price: "",
    status: "draft",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => setProjects(data.projects || []))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/units", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          projectId: form.projectId,
          unitNumber: form.unitNumber,
          unitType: form.unitType,
          bedrooms: form.bedrooms ? Number(form.bedrooms) : undefined,
          bathrooms: form.bathrooms ? Number(form.bathrooms) : undefined,
          areaSqft: form.areaSqft ? Number(form.areaSqft) : undefined,
          price: Number(form.price),
          status: form.status,
        }),
      });

      if (res.ok) {
        toast.success("Unit created successfully");
        router.push(`/${locale}/units`);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || tc("error"));
      }
    } catch {
      toast.error(tc("error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Link href={`/${locale}/units`}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("newUnit")}</h1>
          <p className="text-sm text-muted-foreground">Add a new property unit</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Project *</Label>
              {projects.length === 0 ? (
                <div className="p-3 rounded-lg border border-dashed text-sm text-muted-foreground">
                  No projects available. <Link href={`/${locale}/projects`} className="text-primary underline">Create a project first</Link>.
                </div>
              ) : (
                <Select value={form.projectId} onValueChange={(v) => setForm({...form, projectId: v || ""})}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("unitNumber")} *</Label>
              <Input value={form.unitNumber} onChange={(e) => setForm({...form, unitNumber: e.target.value})} required className="h-11" />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("type")}</Label>
              <Select value={form.unitType} onValueChange={(v) => setForm({...form, unitType: v || "apartment"})}>
                <SelectTrigger className="h-11">
                  <SelectValue>{t(form.unitType)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="villa">{t("villa")}</SelectItem>
                  <SelectItem value="plot">{t("plot")}</SelectItem>
                  <SelectItem value="apartment">{t("apartment")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("bedrooms")}</Label>
                <Input type="number" value={form.bedrooms} onChange={(e) => setForm({...form, bedrooms: e.target.value})} className="h-11" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("bathrooms")}</Label>
                <Input type="number" value={form.bathrooms} onChange={(e) => setForm({...form, bathrooms: e.target.value})} className="h-11" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("area")}</Label>
                <Input type="number" value={form.areaSqft} onChange={(e) => setForm({...form, areaSqft: e.target.value})} className="h-11" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("price")} *</Label>
                <Input type="number" value={form.price} onChange={(e) => setForm({...form, price: e.target.value})} required className="h-11" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({...form, status: v || "draft"})}>
                <SelectTrigger className="h-11">
                  <SelectValue>{t(form.status)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">{t("draft")}</SelectItem>
                  <SelectItem value="available">{t("available")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading} className="h-11 px-6">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : tc("save")}
              </Button>
              <Link href={`/${locale}/units`}>
                <Button variant="outline" className="h-11 px-6">{tc("cancel")}</Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
