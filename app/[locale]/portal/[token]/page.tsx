"use client";

import {useEffect, useState} from "react";
import {useParams} from "next/navigation";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Building2, CalendarDays} from "lucide-react";

export default function PortalPage() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/portal/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((data) => {
        setData(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Invalid or expired portal link.");
        setLoading(false);
      });
  }, [token]);

  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (error) return <div className="p-8 text-center text-destructive">{error}</div>;
  if (!data) return null;

  const {transaction, payments, totalPaid, remainingBalance} = data;
  const milestones = transaction.payment_plan_milestones || [];

  return (
    <div className="min-h-screen bg-muted/40 p-4">
      <div className="max-w-md mx-auto space-y-4">
        {/* Header */}
        <div className="text-center py-6">
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-sm">
              <Building2 className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="text-left">
              <h1 className="text-2xl font-bold">Plinth</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Buyer Portal</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{transaction.project_name}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Unit Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Unit</span>
              <span className="font-medium">{transaction.unit_number}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Type</span>
              <span className="capitalize">{transaction.unit_type}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Area</span>
              <span>{transaction.area_sqft ? `${transaction.area_sqft} sqft` : "—"}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Financial Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Price</span>
              <span className="font-medium">AED {Number(transaction.total_price).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Paid</span>
              <span className="font-medium text-green-600">AED {Number(totalPaid).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Remaining</span>
              <span className="font-medium">AED {Number(remainingBalance).toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>

        {/* Payment Schedule */}
        {milestones.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                Payment Schedule
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {milestones.map((m: any, i: number) => (
                <div key={i} className="flex justify-between items-center py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{m.label}</p>
                    <p className="text-xs text-muted-foreground">{m.percent}% of total price</p>
                  </div>
                  <span className="text-sm font-medium">
                    AED {Math.round(Number(transaction.total_price) * (m.percent / 100)).toLocaleString()}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {payments.length === 0 && <p className="text-sm text-muted-foreground">No payments yet.</p>}
            {payments.map((p: any) => (
              <div key={p.id} className="flex justify-between items-center py-2 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium">AED {Number(p.amount).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{p.payment_method} · {new Date(p.created_at).toLocaleDateString()}</p>
                </div>
                <Badge variant="outline">{p.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
