"use client";

import {useEffect, useState} from "react";
import {useLocale} from "next-intl";
import Link from "next/link";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Card, CardContent} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {Plus, Loader2, Trash2, CalendarDays} from "lucide-react";
import {toast} from "sonner";

export default function PaymentPlansPage() {
  const locale = useLocale();
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({name: "", description: ""});
  const [milestones, setMilestones] = useState<{label: string; percent: number; due_days_from_booking: number}[]>([
    {label: "EOI", percent: 10, due_days_from_booking: 0},
    {label: "Booking", percent: 15, due_days_from_booking: 14},
    {label: "1st Installment", percent: 25, due_days_from_booking: 90},
    {label: "2nd Installment", percent: 25, due_days_from_booking: 180},
    {label: "Final Payment", percent: 25, due_days_from_booking: 365},
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPlans();
  }, []);

  async function fetchPlans() {
    try {
      const res = await fetch("/api/payment-plans");
      const data = await res.json();
      setPlans(data.paymentPlans || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/payment-plans", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        name: form.name,
        description: form.description,
        milestones,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setForm({name: "", description: ""});
      setShowDialog(false);
      fetchPlans();
      toast.success("Payment plan created");
    } else {
      toast.error("Failed to create payment plan");
    }
  }

  async function deletePlan(id: string) {
    if (!confirm("Delete this payment plan?")) return;
    const res = await fetch(`/api/payment-plans/${id}`, {method: "DELETE"});
    if (res.ok) {
      fetchPlans();
      toast.success("Payment plan deleted");
    } else {
      toast.error("Failed to delete");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payment Plans</h1>
          <p className="text-muted-foreground mt-1">Manage installment schedules for transactions</p>
        </div>
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogTrigger>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Plan
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Payment Plan</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Plan Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} required />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Milestones</Label>
                <div className="space-y-2">
                  {milestones.map((m, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <Input value={m.label} onChange={(e) => {
                        const next = [...milestones];
                        next[i].label = e.target.value;
                        setMilestones(next);
                      }} className="flex-1" placeholder="Label" />
                      <Input type="number" value={m.percent} onChange={(e) => {
                        const next = [...milestones];
                        next[i].percent = Number(e.target.value);
                        setMilestones(next);
                      }} className="w-20" placeholder="%" />
                      <Input type="number" value={m.due_days_from_booking} onChange={(e) => {
                        const next = [...milestones];
                        next[i].due_days_from_booking = Number(e.target.value);
                        setMilestones(next);
                      }} className="w-24" placeholder="Days" />
                      <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => setMilestones(milestones.filter((_, idx) => idx !== i))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => setMilestones([...milestones, {label: "", percent: 0, due_days_from_booking: 0}])}>
                    + Add Milestone
                  </Button>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : plans.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <CalendarDays className="h-10 w-10 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground font-medium">No payment plans yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Create a plan to use in transactions</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {plans.map((plan: any) => (
            <Card key={plan.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-base">{plan.name}</p>
                    {plan.description && <p className="text-sm text-muted-foreground">{plan.description}</p>}
                  </div>
                  {!plan.is_default && (
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => deletePlan(plan.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  {(plan.milestones || []).map((m: any, i: number) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span>{m.label}</span>
                      <span className="font-medium">{m.percent}% · {m.due_days_from_booking} days</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
