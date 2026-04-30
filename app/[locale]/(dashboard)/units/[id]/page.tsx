"use client";

import {useEffect, useState} from "react";
import {useTranslations, useLocale} from "next-intl";
import {useParams, useRouter} from "next/navigation";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {ArrowLeft, Send, Loader2} from "lucide-react";
import Link from "next/link";
import {toast} from "sonner";

export default function UnitDetailPage() {
  const t = useTranslations("units");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [unit, setUnit] = useState<any>(null);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    fetchUnit();
  }, [id]);

  async function fetchUnit() {
    try {
      const res = await fetch(`/api/units/${id}`);
      const data = await res.json();
      setUnit(data.unit);
      setForm(data.unit);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/units/${id}`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          unitNumber: form.unit_number,
          unitType: form.unit_type,
          bedrooms: form.bedrooms ? Number(form.bedrooms) : null,
          bathrooms: form.bathrooms ? Number(form.bathrooms) : null,
          areaSqft: form.area_sqft ? Number(form.area_sqft) : null,
          price: Number(form.price),
          status: form.status,
        }),
      });
      if (res.ok) {
        setEditMode(false);
        fetchUnit();
        toast.success("Unit updated successfully");
      } else {
        toast.error(tc("error"));
      }
    } catch {
      toast.error(tc("error"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-muted-foreground">{tc("loading")}</div>;
  if (!unit) return <div className="text-muted-foreground">{tc("noData")}</div>;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Link href={`/${locale}/units`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">{unit.unit_number}</h1>
        <Badge variant="secondary">{t(unit.status)}</Badge>
      </div>

      <Card>
        <CardContent className="pt-6">
          {editMode ? (
            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="space-y-2">
                <Label>{t("unitNumber")}</Label>
                <Input value={form.unit_number || ""} onChange={(e) => setForm({...form, unit_number: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>{t("type")}</Label>
                <Select value={form.unit_type} onValueChange={(v) => setForm({...form, unit_type: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
                  <Input type="number" value={form.bedrooms || ""} onChange={(e) => setForm({...form, bedrooms: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>{t("bathrooms")}</Label>
                  <Input type="number" value={form.bathrooms || ""} onChange={(e) => setForm({...form, bathrooms: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("area")}</Label>
                  <Input type="number" value={form.area_sqft || ""} onChange={(e) => setForm({...form, area_sqft: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>{t("price")}</Label>
                  <Input type="number" value={form.price || ""} onChange={(e) => setForm({...form, price: e.target.value})} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({...form, status: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">{t("draft")}</SelectItem>
                    <SelectItem value="available">{t("available")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : tc("save")}
                </Button>
                <Button variant="outline" onClick={() => setEditMode(false)} disabled={saving}>{tc("cancel")}</Button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("type")}</span>
                <span>{t(unit.unit_type)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("project")}</span>
                <span>{unit.project_name || "—"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("price")}</span>
                <span className="font-medium">AED {Number(unit.price).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("area")}</span>
                <span>{unit.area_sqft ? `${unit.area_sqft} sqft` : "—"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("bedrooms")}</span>
                <span>{unit.bedrooms || "—"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("bathrooms")}</span>
                <span>{unit.bathrooms || "—"}</span>
              </div>
              <Button onClick={() => setEditMode(true)}>{tc("edit")}</Button>
              {unit.status === 'draft' && (
                <Button variant="outline" disabled={requesting} onClick={async () => {
                  setRequesting(true);
                  try {
                    const res = await fetch("/api/unit-approvals", {
                      method: "POST",
                      headers: {"Content-Type": "application/json"},
                      body: JSON.stringify({unit_id: id}),
                    });
                    if (res.ok) {
                      toast.success("Approval requested successfully");
                    } else {
                      const data = await res.json().catch(() => ({}));
                      toast.error(data.error || "Failed to request approval");
                    }
                  } catch {
                    toast.error("Failed to request approval");
                  } finally {
                    setRequesting(false);
                  }
                }}>
                  {requesting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                  Request Approval
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
