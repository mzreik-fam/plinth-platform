"use client";

import {useEffect, useState} from "react";
import {useTranslations, useLocale} from "next-intl";
import {useParams} from "next/navigation";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Label} from "@/components/ui/label";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {ArrowLeft, Copy, FileText, KeyRound, AlertTriangle} from "lucide-react";
import Link from "next/link";
import {toast} from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {Skeleton} from "@/components/ui/skeleton";

const paymentMethodLabels: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  cheque: "Cheque",
  cash: "Cash",
  card: "Card",
};

const statusColors: Record<string, string> = {
  eoi: "warning",
  booking_pending: "secondary",
  confirmed: "success",
  cancelled: "destructive",
  terminated: "destructive",
};

export default function TransactionDetailPage() {
  const t = useTranslations("sales");
  const tc = useTranslations("common");
  const locale = useLocale();
  const params = useParams();
  const id = params.id as string;

  const [transaction, setTransaction] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState({amount: "", paymentMethod: "bank_transfer", referenceNumber: "", notes: ""});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTransaction();
  }, [id]);

  async function fetchTransaction() {
    try {
      const res = await fetch(`/api/transactions/${id}`);
      const data = await res.json();
      setTransaction(data.transaction);
      setPayments(data.payments || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(newStatus: string) {
    const res = await fetch(`/api/transactions/${id}`, {
      method: "PATCH",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({status: newStatus}),
    });
    if (res.ok) fetchTransaction();
  }

  async function recordPayment(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/payments", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        transaction_id: id,
        amount: Number(paymentForm.amount),
        payment_method: paymentForm.paymentMethod,
        reference_number: paymentForm.referenceNumber,
        notes: paymentForm.notes,
      }),
    });
    if (res.ok) {
      setShowPaymentForm(false);
      setPaymentForm({amount: "", paymentMethod: "bank_transfer", referenceNumber: "", notes: ""});
      fetchTransaction();
      toast.success("Payment recorded");
    } else {
      toast.error("Failed to record payment");
    }
  }

  function copyPortalLink() {
    if (!transaction?.portal_token) return;
    const url = `${window.location.origin}/${locale}/portal/${transaction.portal_token}`;
    navigator.clipboard.writeText(url);
    toast.success("Portal link copied!");
  }

  if (loading) return <div className="text-muted-foreground">{tc("loading")}</div>;
  if (!transaction) return <div className="text-muted-foreground">{tc("noData")}</div>;

  const totalPaid = payments.filter((p: any) => p.status === 'confirmed').reduce((sum: number, p: any) => sum + Number(p.amount), 0);
  const remaining = Number(transaction.total_price) - totalPaid;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Link href={`/${locale}/sales`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">{transaction.buyer_name}</h1>
        <Badge variant={statusColors[transaction.status] as any || "secondary"}>
          {t(transaction.status)}
        </Badge>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("unit")}</span>
            <Link href={`/${locale}/units/${transaction.unit_id}`} className="font-medium hover:underline">
              {transaction.unit_number} · {transaction.unit_type}
            </Link>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Buyer</span>
            <Link href={`/${locale}/buyers`} className="font-medium hover:underline">
              {transaction.buyer_name}
            </Link>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("totalPrice")}</span>
            <span className="font-medium">AED {Number(transaction.total_price).toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total Paid</span>
            <span className="font-medium text-green-600">AED {totalPaid.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Remaining</span>
            <span className="font-medium">AED {remaining.toLocaleString()}</span>
          </div>
          {transaction.agent_name && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Agent</span>
              <Link href={`/${locale}/users`} className="font-medium hover:underline">{transaction.agent_name}</Link>
            </div>
          )}
          {transaction.portal_token && (
            <div className="flex items-center gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={copyPortalLink}>
                <Copy className="h-3 w-3 mr-1" />
                Copy Buyer Portal Link
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Link href={`/${locale}/financial-statement?transaction_id=${id}`}>
            <Button variant="outline">
              <FileText className="h-4 w-4 mr-1" />
              Financial Statement
            </Button>
          </Link>
          {transaction.status === 'confirmed' && (
            <Button variant="outline" onClick={async () => {
              const res = await fetch("/api/handovers", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({transaction_id: id, unit_id: transaction.unit_id}),
              });
              if (res.ok) {
                const data = await res.json();
                window.location.href = `/${locale}/handovers/${data.handover.id}`;
              }
            }}>
              <KeyRound className="h-4 w-4 mr-1" />
              Start Handover
            </Button>
          )}
          {(transaction.status === 'eoi' || transaction.status === 'booking_pending' || transaction.status === 'confirmed') && (
            <AlertDialog>
              <AlertDialogTrigger>
                <Button variant="destructive">
                  <AlertTriangle className="h-4 w-4 mr-1" />
                  Terminate
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Terminate this transaction?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This starts the DLD termination process. The transaction and unit will be marked as terminated. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      const res = await fetch("/api/terminations", {
                        method: "POST",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({
                          transaction_id: id,
                          unit_id: transaction.unit_id,
                          buyer_id: transaction.buyer_id,
                          reason: "Buyer request",
                          total_paid: totalPaid,
                        }),
                      });
                      if (res.ok) {
                        const data = await res.json();
                        window.location.href = `/${locale}/terminations/${data.case.id}`;
                      }
                    }}
                    className="bg-destructive text-destructive-foreground"
                  >
                    Yes, Terminate
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {transaction.status === 'eoi' && (
            <Button onClick={() => updateStatus('booking_pending')}>Move to Booking Pending</Button>
          )}
          {transaction.status === 'booking_pending' && (
            <Button onClick={() => updateStatus('confirmed')}>Confirm Booking</Button>
          )}
          {(transaction.status === 'eoi' || transaction.status === 'booking_pending') && (
            <Button variant="destructive" onClick={() => updateStatus('cancelled')}>Cancel</Button>
          )}
          <Button variant="outline" onClick={() => setShowPaymentForm(!showPaymentForm)}>
            {t("recordPayment")}
          </Button>
        </CardContent>
      </Card>

      {/* Payment Form */}
      {showPaymentForm && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={recordPayment} className="space-y-4">
              <div className="space-y-2">
                <Label>{t("paymentAmount")}</Label>
                <Input type="number" value={paymentForm.amount} onChange={(e) => setPaymentForm({...paymentForm, amount: e.target.value})} required />
              </div>
              <div className="space-y-2">
                <Label>{t("paymentMethod")}</Label>
                <Select value={paymentForm.paymentMethod} onValueChange={(v) => setPaymentForm({...paymentForm, paymentMethod: v || "bank_transfer"})}>
                  <SelectTrigger>
                    <SelectValue>{paymentMethodLabels[paymentForm.paymentMethod]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank_transfer">{t("bankTransfer")}</SelectItem>
                    <SelectItem value="cheque">{t("cheque")}</SelectItem>
                    <SelectItem value="cash">{t("cash")}</SelectItem>
                    <SelectItem value="card">{t("card")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("referenceNumber")}</Label>
                <Input value={paymentForm.referenceNumber} onChange={(e) => setPaymentForm({...paymentForm, referenceNumber: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={paymentForm.notes || ""} onChange={(e) => setPaymentForm({...paymentForm, notes: e.target.value})} rows={2} />
              </div>
              <div className="flex gap-2">
                <Button type="submit">{tc("save")}</Button>
                <Button variant="outline" onClick={() => setShowPaymentForm(false)}>{tc("cancel")}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Payments List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {payments.length === 0 && <p className="text-sm text-muted-foreground">No payments recorded.</p>}
          {payments.map((p: any) => (
            <div key={p.id} className="flex justify-between items-center py-2 border-b last:border-0">
              <div>
                <p className="text-sm font-medium">AED {Number(p.amount).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{p.payment_method} · {p.reference_number || "—"}</p>
              </div>
              <Badge variant="outline">{p.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
