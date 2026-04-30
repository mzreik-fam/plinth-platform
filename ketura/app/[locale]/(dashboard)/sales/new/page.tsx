"use client";

import {useEffect, useState} from "react";
import {useTranslations, useLocale} from "next-intl";
import {useRouter} from "next/navigation";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {ArrowLeft} from "lucide-react";
import Link from "next/link";

export default function NewTransactionPage() {
  const t = useTranslations("sales");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [units, setUnits] = useState<any[]>([]);
  const [buyers, setBuyers] = useState<any[]>([]);
  const [paymentPlans, setPaymentPlans] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [form, setForm] = useState<any>({
    unitId: "",
    buyerId: "",
    paymentPlanId: "",
    agentId: "",
    totalPrice: "",
    eoiAmount: "",
    bookingAmount: "",
    notes: "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/units?status=available")
      .then((r) => r.json())
      .then((data) => setUnits(data.units || []))
      .catch(() => {});
    fetch("/api/buyers")
      .then((r) => r.json())
      .then((data) => setBuyers(data.buyers || []))
      .catch(() => {});
    fetch("/api/payment-plans")
      .then((r) => r.json())
      .then((data) => setPaymentPlans(data.paymentPlans || []))
      .catch(() => {});
    fetch("/api/users?role=internal_agent")
      .then((r) => r.json())
      .then((data) => setAgents(data.users || []))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          unitId: form.unitId,
          buyerId: form.buyerId,
          paymentPlanId: form.paymentPlanId || undefined,
          agentId: form.agentId || undefined,
          totalPrice: Number(form.totalPrice),
          eoiAmount: form.eoiAmount ? Number(form.eoiAmount) : undefined,
          bookingAmount: form.bookingAmount ? Number(form.bookingAmount) : undefined,
          notes: form.notes,
        }),
      });

      if (res.ok) {
        router.push(`/${locale}/sales`);
      } else {
        const data = await res.json();
        alert(data.error || tc("error"));
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
        <Link href={`/${locale}/sales`}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("newTransaction")}</h1>
          <p className="text-sm text-muted-foreground">Create a new sale or EOI</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("unit")}</Label>
              <Select value={form.unitId} onValueChange={(v) => setForm({...form, unitId: v})}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Select unit" /></SelectTrigger>
                <SelectContent>
                  {units.map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>{u.unit_number} — AED {Number(u.price).toLocaleString()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("buyer")}</Label>
              <Select value={form.buyerId} onValueChange={(v) => setForm({...form, buyerId: v})}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Select buyer" /></SelectTrigger>
                <SelectContent>
                  {buyers.map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>{b.full_name} — {b.phone}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Payment Plan</Label>
                <Select value={form.paymentPlanId} onValueChange={(v) => setForm({...form, paymentPlanId: v})}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Select plan" /></SelectTrigger>
                  <SelectContent>
                    {paymentPlans.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Agent</Label>
                <Select value={form.agentId} onValueChange={(v) => setForm({...form, agentId: v})}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    {agents.map((a: any) => (
                      <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("totalPrice")}</Label>
              <Input type="number" value={form.totalPrice} onChange={(e) => setForm({...form, totalPrice: e.target.value})} required className="h-11" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("eoiAmount")}</Label>
                <Input type="number" value={form.eoiAmount} onChange={(e) => setForm({...form, eoiAmount: e.target.value})} className="h-11" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("bookingAmount")}</Label>
                <Input type="number" value={form.bookingAmount} onChange={(e) => setForm({...form, bookingAmount: e.target.value})} className="h-11" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})} className="h-11" />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading} className="h-11 px-6">{tc("save")}</Button>
              <Link href={`/${locale}/sales`}>
                <Button variant="outline" className="h-11 px-6">{tc("cancel")}</Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
