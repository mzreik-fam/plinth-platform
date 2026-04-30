"use client";

import {useEffect, useState} from "react";
import {useTranslations, useLocale} from "next-intl";
import {Button} from "@/components/ui/button";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Skeleton} from "@/components/ui/skeleton";
import {toast} from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {Textarea} from "@/components/ui/textarea";
import {Label} from "@/components/ui/label";
import {CheckCircle, XCircle, FileText, ExternalLink} from "lucide-react";
import Link from "next/link";

interface PendingPayment {
  id: string;
  amount: number;
  payment_method: string;
  reference_number: string | null;
  created_at: string;
  transaction_id: string;
  unit_number: string;
  buyer_name: string;
  proof_document_url: string | null;
}

const paymentMethodLabels: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  cheque: "Cheque",
  cash: "Cash",
  card: "Card",
};

export default function PendingPaymentsPage() {
  const t = useTranslations("common");
  const locale = useLocale();
  const [payments, setPayments] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPayment, setSelectedPayment] = useState<PendingPayment | null>(null);
  const [actionType, setActionType] = useState<'confirm' | 'reject' | null>(null);
  const [notes, setNotes] = useState("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchPendingPayments();
  }, []);

  async function fetchPendingPayments() {
    try {
      const res = await fetch("/api/payments?status=pending");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setPayments(data.payments || []);
    } catch (error) {
      toast.error("Failed to load pending payments");
    } finally {
      setLoading(false);
    }
  }

  async function handleAction() {
    if (!selectedPayment || !actionType) return;

    setProcessing(true);
    try {
      const res = await fetch(`/api/payments/${selectedPayment.id}`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          action: actionType,
          notes: notes || undefined,
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
        setNotes("");
        fetchPendingPayments();
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to process payment");
      }
    } catch (error) {
      toast.error("An error occurred");
    } finally {
      setProcessing(false);
    }
  }

  function openActionDialog(payment: PendingPayment, action: 'confirm' | 'reject') {
    setSelectedPayment(payment);
    setActionType(action);
    setNotes("");
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Pending Payment Review</h1>
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pending Payment Review</h1>
        <Badge variant="secondary">{payments.length} pending</Badge>
      </div>

      {payments.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center py-12">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <p className="text-muted-foreground">No pending payments to review.</p>
            <p className="text-sm text-muted-foreground mt-1">
              All payments have been processed.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {payments.map((payment) => (
            <Card key={payment.id}>
              <CardContent className="pt-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-semibold">
                        AED {Number(payment.amount).toLocaleString()}
                      </span>
                      <Badge variant="secondary">Pending</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>
                        <span className="font-medium">Buyer:</span> {payment.buyer_name}
                      </p>
                      <p>
                        <span className="font-medium">Unit:</span> {payment.unit_number}
                      </p>
                      <p>
                        <span className="font-medium">Method:</span>{" "}
                        {paymentMethodLabels[payment.payment_method] || payment.payment_method}
                      </p>
                      {payment.reference_number && (
                        <p>
                          <span className="font-medium">Reference:</span> {payment.reference_number}
                        </p>
                      )}
                      <p>
                        <span className="font-medium">Submitted:</span>{" "}
                        {new Date(payment.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    {payment.proof_document_url ? (
                      <a
                        href={payment.proof_document_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                      >
                        <FileText className="h-4 w-4" />
                        View Proof
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        No proof uploaded
                      </span>
                    )}
                    
                    <Link
                      href={`/${locale}/sales/${payment.transaction_id}`}
                      className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      <ExternalLink className="h-4 w-4" />
                      View Transaction
                    </Link>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openActionDialog(payment, 'reject')}
                      className="text-destructive hover:bg-destructive/10"
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => openActionDialog(payment, 'confirm')}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Confirm
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Action Dialog */}
      <Dialog open={!!selectedPayment} onOpenChange={() => {
        setSelectedPayment(null);
        setActionType(null);
        setNotes("");
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'confirm' ? 'Confirm Payment' : 'Reject Payment'}
            </DialogTitle>
            <DialogDescription>
              {actionType === 'confirm' 
                ? `Confirm receipt of AED ${selectedPayment ? Number(selectedPayment.amount).toLocaleString() : ''} from ${selectedPayment?.buyer_name}?`
                : `Reject this payment from ${selectedPayment?.buyer_name}? This will mark it as rejected and it will not count toward the unit balance.`
              }
            </DialogDescription>
          </DialogHeader>

          {actionType === 'confirm' && selectedPayment?.proof_document_url && (
            <div className="bg-muted p-3 rounded-md">
              <p className="text-sm font-medium mb-1">Proof of Transfer:</p>
              <a
                href={selectedPayment.proof_document_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline inline-flex items-center gap-1"
              >
                <FileText className="h-4 w-4" />
                View Document
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
                setNotes("");
              }}
              disabled={processing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAction}
              disabled={processing}
              variant={actionType === 'reject' ? 'destructive' : 'default'}
            >
              {processing 
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
