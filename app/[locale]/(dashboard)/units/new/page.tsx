"use client";

import {useState, useEffect} from "react";
import {useTranslations, useLocale} from "next-intl";
import {useRouter} from "next/navigation";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {ArrowLeft} from "lucide-react";
import Link from "next/link";

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
        router.push(`/${locale}/units`);
      } else {
        alert(tc("error"));
      }
    } catch {
      alert(tc("error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Link href={`/${locale}/units`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">{t("newUnit")}</h1>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={form.projectId} onValueChange={(v) => setForm({...form, projectId: v || ""})}>
                <SelectTrigger>
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t("unitNumber")}</Label>
              <Input value={form.unitNumber} onChange={(e) => setForm({...form, unitNumber: e.target.value})} required />
            </div>

            <div className="space-y-2">
              <Label>{t("type")}</Label>
              <Select value={form.unitType} onValueChange={(v) => setForm({...form, unitType: v || "apartment"})}>
                <SelectTrigger>
                  <SelectValue />
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
                <Label>{t("bedrooms")}</Label>
                <Input type="number" value={form.bedrooms} onChange={(e) => setForm({...form, bedrooms: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>{t("bathrooms")}</Label>
                <Input type="number" value={form.bathrooms} onChange={(e) => setForm({...form, bathrooms: e.target.value})} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("area")}</Label>
                <Input type="number" value={form.areaSqft} onChange={(e) => setForm({...form, areaSqft: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>{t("price")}</Label>
                <Input type="number" value={form.price} onChange={(e) => setForm({...form, price: e.target.value})} required />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({...form, status: v || "draft"})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">{t("draft")}</SelectItem>
                  <SelectItem value="available">{t("available")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={loading}>{tc("save")}</Button>
              <Link href={`/${locale}/units`}>
                <Button variant="outline">{tc("cancel")}</Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
