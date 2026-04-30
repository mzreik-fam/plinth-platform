"use client";

import {useEffect, useState} from "react";
import {useTranslations, useLocale} from "next-intl";
import {useRouter} from "next/navigation";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Card, CardContent} from "@/components/ui/card";
import {ArrowLeft, Loader2} from "lucide-react";
import Link from "next/link";
import {toast} from "sonner";

export default function NewBuyerPage() {
  const t = useTranslations("buyers");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    emiratesId: "",
    passportNumber: "",
    nationality: "",
    address: "",
  });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/buyers", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(form),
      });

      if (res.ok) {
        toast.success("Buyer created successfully");
        router.push(`/${locale}/buyers`);
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
        <Link href={`/${locale}/buyers`}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("newBuyer")}</h1>
          <p className="text-sm text-muted-foreground">Add a new buyer to the system</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("fullName")} *</Label>
              <Input value={form.fullName} onChange={(e) => setForm({...form, fullName: e.target.value})} required className="h-11" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("phone")} *</Label>
                <Input value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})} required className="h-11" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("email")}</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} className="h-11" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("emiratesId")}</Label>
                <Input value={form.emiratesId} onChange={(e) => setForm({...form, emiratesId: e.target.value})} className="h-11" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Passport Number</Label>
                <Input value={form.passportNumber} onChange={(e) => setForm({...form, passportNumber: e.target.value})} className="h-11" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Nationality</Label>
                <Input value={form.nationality} onChange={(e) => setForm({...form, nationality: e.target.value})} className="h-11" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Address</Label>
                <Input value={form.address} onChange={(e) => setForm({...form, address: e.target.value})} className="h-11" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading} className="h-11 px-6">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : tc("save")}
              </Button>
              <Link href={`/${locale}/buyers`}>
                <Button variant="outline" className="h-11 px-6">{tc("cancel")}</Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
