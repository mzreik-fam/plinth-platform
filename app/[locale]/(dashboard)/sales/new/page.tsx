"use client";

import {useEffect, useState} from "react";
import {useTranslations, useLocale} from "next-intl";
import {useRouter} from "next/navigation";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Label} from "@/components/ui/label";
import {Card, CardContent} from "@/components/ui/card";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {ArrowLeft, Loader2} from "lucide-react";
import Link from "next/link";
import {toast} from "sonner";

interface UnitOption {
  id: string;
  unit_number: string;
  price: number;
}

interface BuyerOption {
  id: string;
  full_name: string;
  phone: string;
}

interface PaymentPlanOption {
  id: string;
  name: string;
}

interface AgentOption {
  id: string;
  full_name: string;
}

interface TransactionForm {
  unitId: string;
  buyerId: string;
  paymentPlanId: string;
  agentId: string;
  totalPrice: string;
  eoiAmount: string;
  bookingAmount: string;
  notes: string;
}

export default function NewTransactionPage() {
  const t = useTranslations("sales");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [buyers, setBuyers] = useState<BuyerOption[]>([]);
  const [paymentPlans, setPaymentPlans] = useState<PaymentPlanOption[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [form, setForm] = useState<TransactionForm>({
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
          unit_id: form.unitId,
          buyer_id: form.buyerId,
          payment_plan_id: form.paymentPlanId || undefined,
          agent_id: form.agentId || undefined,
          total_price: Number(form.totalPrice),
          eoi_amount: form.eoiAmount ? Number(form.eoiAmount) : undefined,
          booking_amount: form.bookingAmount ? Number(form.bookingAmount) : undefined,
          notes: form.notes,
        }),
      });

      if (res.ok) {
        toast.success("Transaction created successfully");
        router.push(`/${locale}/sales`);
      } else {
        const data = await res.json();
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
              <Select value={form.unitId} onValueChange={(v) => {
                const selected = units.find((u) => u.id === v);
                setForm({...form, unitId: v, totalPrice: selected ? String(selected.price) : form.totalPrice});
              }}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Select unit">{units.find((u) => u.id === form.unitId)?.unit_number || "Select unit"}</SelectValue></SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.unit_number} — AED {Number(u.price).toLocaleString()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("buyer")}</Label>
              <Select value={form.buyerId} onValueChange={(v) => setForm({...form, buyerId: v})}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Select buyer">{buyers.find((b) => b.id === form.buyerId)?.full_name || "Select buyer"}</SelectValue></SelectTrigger>
                <SelectContent>
                  {buyers.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.full_name} — {b.phone}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Payment Plan</Label>
                <Select value={form.paymentPlanId} onValueChange={(v) => setForm({...form, paymentPlanId: v})}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Select plan">{paymentPlans.find((p) => p.id === form.paymentPlanId)?.name || "Select plan"}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {paymentPlans.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Agent</Label>
                <Select value={form.agentId} onValueChange={(v) => setForm({...form, agentId: v})}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Optional">{agents.find((a) => a.id === form.agentId)?.full_name || "Optional"}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {agents.map((a) => (
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
              <Textarea value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})} rows={3} />
            </div>

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading} className="h-11 px-6">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : tc("save")}
              </Button>
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
