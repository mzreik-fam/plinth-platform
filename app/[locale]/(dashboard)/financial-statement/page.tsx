"use client";

import {useEffect, useState} from "react";
import {useLocale} from "next-intl";
import Link from "next/link";
import {Button} from "@/components/ui/button";
import {useSearchParams} from "next/navigation";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {FileText, TrendingUp, AlertTriangle, CheckCircle2, Clock} from "lucide-react";

export default function FinancialStatementPage() {
  const searchParams = useSearchParams();
  const locale = useLocale();
  const transactionId = searchParams.get("transaction_id");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!transactionId) return;
    fetch(`/api/financial-statement?transaction_id=${transactionId}`)
      .then((r) => r.json())
      .then((data) => {
        setData(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [transactionId]);

  if (!transactionId) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Select a transaction to view its statement.</p>
        <Link href={`/${locale}/sales`}>
          <Button className="mt-4">Go to Sales</Button>
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!data?.transaction) {
    return <div className="text-center py-8">Financial statement not found</div>;
  }

  const {transaction, payments, penalties, documents, summary} = data;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Financial Statement
          </h1>
          <p className="text-muted-foreground">
            {transaction.project_name} — Unit {transaction.unit_number}
          </p>
        </div>
        <Badge variant="outline">
          {transaction.status}
        </Badge>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Price</p>
            <p className="text-xl font-bold">AED {Number(summary.totalPrice).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Paid</p>
            <p className="text-xl font-bold text-green-600">AED {Number(summary.totalPaid).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Outstanding</p>
            <p className="text-xl font-bold text-destructive">AED {Number(summary.outstanding).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Progress</p>
            <p className="text-xl font-bold">{summary.progressPercent}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Progress Bar */}
      <Card>
        <CardContent className="p-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Payment Progress</span>
              <span className="font-medium">{summary.progressPercent}%</span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{width: `${summary.progressPercent}%`}}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>AED 0</span>
              <span>AED {Number(summary.totalPrice).toLocaleString()}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Buyer Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Buyer Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <InfoRow label="Name" value={transaction.buyer_name} />
            <InfoRow label="Email" value={transaction.buyer_email} />
            <InfoRow label="Phone" value={transaction.buyer_phone} />
            <InfoRow label="Agent" value={transaction.agent_name || "Not assigned"} />
          </CardContent>
        </Card>

        {/* Payment Plan */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment Plan</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium">{transaction.payment_plan_name}</p>
            {transaction.payment_plan_milestones && (
              <div className="mt-3 space-y-2">
                {(transaction.payment_plan_milestones as any[]).map((m, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{m.label}</span>
                    <span className="font-medium">{m.percent}%</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payments Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment History</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Confirmed By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell>{new Date(p.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="font-medium">AED {Number(p.amount).toLocaleString()}</TableCell>
                    <TableCell className="capitalize">{p.payment_method?.replace("_", " ")}</TableCell>
                    <TableCell>{p.reference_number || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === "confirmed" ? "outline" : p.status === "rejected" ? "destructive" : "secondary"}>
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{p.confirmed_by_name || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Penalties */}
      {penalties.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Penalties
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Milestone</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Days Overdue</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {penalties.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.milestone_label}</TableCell>
                    <TableCell>{new Date(p.due_date).toLocaleDateString()}</TableCell>
                    <TableCell>{p.days_overdue}</TableCell>
                    <TableCell className="font-medium text-destructive">AED {Number(p.penalty_amount).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === "active" ? "destructive" : "outline"}>{p.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Documents */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documents</CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
          ) : (
            <div className="space-y-2">
              {documents.map((d: any) => (
                <div key={d.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{d.file_name}</p>
                      <p className="text-xs text-muted-foreground">{d.category} — {d.uploaded_by_name}</p>
                    </div>
                  </div>
                  <Badge variant="outline">{new Date(d.created_at).toLocaleDateString()}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({label, value}: {label: string; value: string}) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
