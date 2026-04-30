"use client";

import {useEffect, useState} from "react";
import {useTranslations, useLocale} from "next-intl";
import Link from "next/link";
import {useParams} from "next/navigation";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {ArrowLeft, Loader2} from "lucide-react";
import {toast} from "sonner";

export default function EditBuyerPage() {
  const t = useTranslations("buyers");
  const tc = useTranslations("common");
  const locale = useLocale();
  const {id} = useParams();
  const [buyer, setBuyer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/buyers/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setBuyer(data.buyer);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(`/api/buyers/${id}`, {
      method: "PATCH",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        fullName: buyer.full_name,
        email: buyer.email,
        phone: buyer.phone,
        emiratesId: buyer.emirates_id,
        passportNumber: buyer.passport_number,
        nationality: buyer.nationality,
        address: buyer.address,
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Buyer updated");
    } else {
      toast.error("Failed to update buyer");
    }
  }

  if (loading) return <div className="text-muted-foreground">{tc("loading")}</div>;
  if (!buyer) return <div className="text-muted-foreground">{tc("noData")}</div>;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Link href={`/${locale}/buyers`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Edit Buyer</h1>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label>{t("fullName")}</Label>
              <Input value={buyer.full_name} onChange={(e) => setBuyer({...buyer, full_name: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={buyer.email || ""} onChange={(e) => setBuyer({...buyer, email: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>{t("phone")}</Label>
              <Input value={buyer.phone} onChange={(e) => setBuyer({...buyer, phone: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>{t("emiratesId")}</Label>
              <Input value={buyer.emirates_id || ""} onChange={(e) => setBuyer({...buyer, emirates_id: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Passport Number</Label>
              <Input value={buyer.passport_number || ""} onChange={(e) => setBuyer({...buyer, passport_number: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Nationality</Label>
              <Input value={buyer.nationality || ""} onChange={(e) => setBuyer({...buyer, nationality: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input value={buyer.address || ""} onChange={(e) => setBuyer({...buyer, address: e.target.value})} />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : tc("save")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
