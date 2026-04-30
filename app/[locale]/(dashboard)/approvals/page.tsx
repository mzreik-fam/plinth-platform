"use client";

import {useEffect, useState} from "react";
import {useLocale} from "next-intl";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {ClipboardCheck, CheckCircle2, XCircle} from "lucide-react";

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => r.json())
      .then((data) => setUser(data.user));

    loadApprovals();
  }, []);

  async function loadApprovals() {
    const res = await fetch("/api/unit-approvals");
    const data = await res.json();
    setApprovals(data.approvals || []);
    setLoading(false);
  }

  async function reviewApproval(id: string, status: "approved" | "rejected") {
    await fetch(`/api/unit-approvals/${id}`, {
      method: "PATCH",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({status}),
    });
    await loadApprovals();
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
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-600"
                            onClick={() => reviewApproval(a.id, "approved")}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600"
                            onClick={() => reviewApproval(a.id, "rejected")}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Reject
                          </Button>
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
                        {a.status}
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
