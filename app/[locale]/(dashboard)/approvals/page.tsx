"use client";

import {useEffect, useState, useCallback} from "react";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {ClipboardCheck, CheckCircle2, XCircle, Loader2} from "lucide-react";
import {toast} from "sonner";

interface Approval {
  id: string;
  unit_number: string;
  project_name: string;
  requested_by_name: string;
  requested_at: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by_name?: string;
  reviewed_at?: string;
}

interface User {
  role: string;
  full_name?: string;
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{id: string; status: "approved" | "rejected"} | null>(null);

  const loadApprovals = useCallback(async () => {
    const res = await fetch("/api/unit-approvals");
    const data = await res.json();
    setApprovals(data.approvals || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((data) => setUser(data.user));
  }, []);

  useEffect(() => {
    loadApprovals();
  }, [loadApprovals]);

  async function reviewApproval(id: string, status: "approved" | "rejected") {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/unit-approvals/${id}`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({status}),
      });
      if (res.ok) {
        toast.success(`Approval ${status}`);
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to process");
      }
    } catch {
      toast.error("Failed to process");
    } finally {
      setProcessingId(null);
      await loadApprovals();
    }
  }

  const canReview = user?.role === "super_admin" || user?.role === "project_manager" || user?.role === "platform_owner";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6" />
          Unit Approvals
        </h1>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pending Review</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : approvals.filter((a) => a.status === "pending").length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No pending approvals.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Requested By</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvals.filter((a) => a.status === "pending").map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.unit_number}</TableCell>
                    <TableCell>{a.project_name}</TableCell>
                    <TableCell>{a.requested_by_name}</TableCell>
                    <TableCell>{new Date(a.requested_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">Pending</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {canReview ? (
                        <div className="flex justify-end gap-2">
                          <AlertDialog open={confirmAction?.id === a.id && confirmAction?.status === "approved"} onOpenChange={(open) => !open && setConfirmAction(null)}>
                            <AlertDialogTrigger>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-green-600"
                                onClick={() => setConfirmAction({id: a.id, status: "approved"})}
                                disabled={processingId === a.id}
                              >
                                {processingId === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4 mr-1" /> Approve</>}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Approve Unit</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to approve {a.unit_number}? This will publish it as available.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel onClick={() => setConfirmAction(null)}>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => { reviewApproval(a.id, "approved"); setConfirmAction(null); }}>Approve</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>

                          <AlertDialog open={confirmAction?.id === a.id && confirmAction?.status === "rejected"} onOpenChange={(open) => !open && setConfirmAction(null)}>
                            <AlertDialogTrigger>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600"
                                onClick={() => setConfirmAction({id: a.id, status: "rejected"})}
                                disabled={processingId === a.id}
                              >
                                {processingId === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><XCircle className="h-4 w-4 mr-1" /> Reject</>}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Reject Unit</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to reject {a.unit_number}? The unit will remain in draft status.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel onClick={() => setConfirmAction(null)}>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => { reviewApproval(a.id, "rejected"); setConfirmAction(null); }}>Reject</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Awaiting review</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {approvals.filter((a) => a.status !== "pending").length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">History</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reviewed By</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvals.filter((a) => a.status !== "pending").map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.unit_number}</TableCell>
                    <TableCell>{a.project_name}</TableCell>
                    <TableCell>
                      <Badge variant={a.status === "approved" ? "outline" : "destructive"}>
                        {a.status.charAt(0).toUpperCase() + a.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>{a.reviewed_by_name || "-"}</TableCell>
                    <TableCell>{a.reviewed_at ? new Date(a.reviewed_at).toLocaleDateString() : "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
