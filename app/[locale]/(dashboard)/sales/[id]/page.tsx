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
import {ArrowLeft, Copy, FileText, KeyRound, AlertTriangle, CheckCircle, XCircle, ExternalLink, PenTool, CreditCard} from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  const [currentUser, setCurrentUser] = useState<{role: string} | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [actionType, setActionType] = useState<'confirm' | 'reject' | null>(null);
  const [actionNotes, setActionNotes] = useState("");
  const [processingAction, setProcessingAction] = useState(false);
  const [wetSignatureChecked, setWetSignatureChecked] = useState(false);

  useEffect(() => {
    fetchTransaction();
    fetchCurrentUser();
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

  async function fetchCurrentUser() {
    try {
      const res = await fetch("/api/users/me");
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user);
      }
    } catch {
      // ignore
    }
  }

  const isSuperAdmin = currentUser?.role === 'super_admin';
  const canConfirmPayments = currentUser?.role === 'super_admin' || currentUser?.role === 'admin';

  async function updateStatus(newStatus: string, options?: {signedAt?: string}) {
    const body: any = {status: newStatus};
    if (options?.signedAt) {
      body.signedAt = options.signedAt;
    }
    const res = await fetch(`/api/transactions/${id}`, {
      method: "PATCH",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(body),
    });
    if (res.ok) {
      fetchTransaction();
      setWetSignatureChecked(false);
    } else {
      const error = await res.json();
      toast.error(error.error || "Failed to update status");
    }
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

  async function handlePaymentAction() {
    if (!selectedPayment || !actionType) return;

    setProcessingAction(true);
    try {
      const res = await fetch(`/api/payments/${selectedPayment.id}`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          action: actionType,
          notes: actionNotes || undefined,
        }),
      });

      if (res.ok) {
        toast.success(
          actionType === 'confirm' 
            ? "Payment confirmed successfully" 
            : "Payment rejected"
        );
        setSelectedPayment(null);
        setActionType(null);
        setActionNotes("");
        fetchTransaction();
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to process payment");
      }
    } catch (error) {
      toast.error("An error occurred");
    } finally {
      setProcessingAction(false);
    }
  }

  function openActionDialog(payment: any, action: 'confirm' | 'reject') {
    setSelectedPayment(payment);
    setActionType(action);
    setActionNotes("");
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
  
  // P0-4: Booking confirmation conditions
  const hasSignature = transaction.signed_at != null || wetSignatureChecked;
  const hasConfirmedPayment = payments.some((p: any) => p.status === 'confirmed');
  const canConfirmBooking = transaction.status === 'booking_pending' && hasSignature && hasConfirmedPayment;

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
              {transaction.unit_number} · {transaction.unit_type ? transaction.unit_type.charAt(0).toUpperCase() + transaction.unit_type.slice(1) : ''}
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

      {/* Booking Confirmation Conditions */}
      {transaction.status === 'booking_pending' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Booking Confirmation Requirements
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Signature Requirement */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {transaction.signed_at ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <PenTool className="h-4 w-4 text-amber-500" />
                )}
                <span className="text-sm font-medium">
                  {transaction.signed_at ? 'Buyer Signed' : 'Buyer Signature Required'}
                </span>
                {transaction.signed_at && (
                  <span className="text-xs text-muted-foreground">
                    ({new Date(transaction.signed_at).toLocaleDateString()})
                  </span>
                )}
              </div>
              {!transaction.signed_at && (
                <div className="flex items-start gap-2 pl-6">
                  <input
                    type="checkbox"
                    id="wet-signature"
                    checked={wetSignatureChecked}
                    onChange={(e) => setWetSignatureChecked(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <Label htmlFor="wet-signature" className="text-sm font-normal cursor-pointer">
                    Buyer signed on paper (wet signature)
                  </Label>
                </div>
              )}
            </div>
            
            {/* Payment Requirement */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {hasConfirmedPayment ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <CreditCard className="h-4 w-4 text-amber-500" />
                )}
                <span className="text-sm font-medium">
                  {hasConfirmedPayment ? 'Confirmed Payment Received' : 'Confirmed Payment Required'}
                </span>
              </div>
              {!hasConfirmedPayment && (
                <p className="text-xs text-muted-foreground pl-6">
                  Record a payment below and have an admin confirm it.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

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
          {(transaction.status === 'eoi' || transaction.status === 'booking_pending' || transaction.status === 'confirmed') && isSuperAdmin && (
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
                      } else if (res.status === 403) {
                        toast.error("Only Super Admin can terminate transactions");
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
            <div className="relative inline-block">
              <Button 
                onClick={() => updateStatus('confirmed', wetSignatureChecked ? {signedAt: new Date().toISOString()} : undefined)}
                disabled={!canConfirmBooking}
                title={!canConfirmBooking 
                  ? `Cannot confirm: ${!hasSignature ? 'Signature required. ' : ''}${!hasConfirmedPayment ? 'Confirmed payment required.' : ''}`
                  : 'Confirm booking'
                }
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Confirm Booking
              </Button>
              {!canConfirmBooking && (
                <div className="absolute top-full left-0 mt-2 w-64 p-3 text-sm bg-popover text-popover-foreground rounded-md shadow-md border z-10">
                  <p className="font-medium mb-1">Cannot confirm booking:</p>
                  <ul className="list-disc pl-4 space-y-1">
                    {!hasSignature && <li>Buyer signature required (check &quot;Buyer signed on paper&quot; if wet signature)</li>}
                    {!hasConfirmedPayment && <li>At least one confirmed payment required</li>}
                  </ul>
                </div>
              )}
            </div>
          )}
          {(transaction.status === 'eoi' || transaction.status === 'booking_pending') && isSuperAdmin && (
            <Button variant="destructive" onClick={async () => {
              const res = await fetch(`/api/transactions/${id}`, {
                method: "PATCH",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({status: 'cancelled'}),
              });
              if (res.ok) {
                fetchTransaction();
                toast.success("Transaction cancelled");
              } else if (res.status === 403) {
                toast.error("Only Super Admin can cancel transactions");
              }
            }}>Cancel</Button>
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
            <div key={p.id} className="flex justify-between items-start py-2 border-b last:border-0">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">AED {Number(p.amount).toLocaleString()}</p>
                  <Badge variant={p.status === 'confirmed' ? 'default' : p.status === 'rejected' ? 'destructive' : 'secondary'}>
                    {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{paymentMethodLabels[p.payment_method] || p.payment_method} · {p.reference_number || "—"}</p>
                {p.status === 'confirmed' && p.confirmed_by_name && (
                  <p className="text-xs text-muted-foreground">
                    Confirmed by {p.confirmed_by_name} on {new Date(p.confirmed_at).toLocaleDateString()}
                  </p>
                )}
                {p.proof_document_url && (
                  <a 
                    href={p.proof_document_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View Proof
                  </a>
                )}
              </div>
              {p.status === 'pending' && canConfirmPayments && (
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => openActionDialog(p, 'reject')}
                    className="text-destructive hover:bg-destructive/10"
                  >
                    <XCircle className="h-3 w-3 mr-1" />
                    Reject
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={() => openActionDialog(p, 'confirm')}
                  >
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Confirm
                  </Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Payment Action Dialog */}
      <Dialog open={!!selectedPayment} onOpenChange={() => {
        setSelectedPayment(null);
        setActionType(null);
        setActionNotes("");
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'confirm' ? 'Confirm Payment' : 'Reject Payment'}
            </DialogTitle>
            <DialogDescription>
              {actionType === 'confirm' 
                ? `Confirm receipt of AED ${selectedPayment ? Number(selectedPayment.amount).toLocaleString() : ''}?`
                : `Reject this payment? It will not count toward the unit balance.`
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="actionNotes">Notes (optional)</Label>
            <Textarea
              id="actionNotes"
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              placeholder={actionType === 'confirm' ? "Add confirmation notes..." : "Reason for rejection..."}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedPayment(null);
                setActionType(null);
                setActionNotes("");
              }}
              disabled={processingAction}
            >
              Cancel
            </Button>
            <Button
              onClick={handlePaymentAction}
              disabled={processingAction}
              variant={actionType === 'reject' ? 'destructive' : 'default'}
            >
              {processingAction 
                ? "Processing..." 
                : actionType === 'confirm' 
                  ? "Confirm Payment" 
                  : "Reject Payment"
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
