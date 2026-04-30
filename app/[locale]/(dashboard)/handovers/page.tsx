"use client";

import {useEffect, useState} from "react";
import {useLocale} from "next-intl";
import Link from "next/link";
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
import {KeyRound, Eye} from "lucide-react";



const statusLabels: Record<string, string> = {
  pending_bcc: "Pending BCC",
  payment_due: "Payment Due",
  registration: "Registration",
  inspection_scheduled: "Inspection Scheduled",
  snagging: "Snagging",
  ready_for_handover: "Ready for Handover",
  completed: "Completed",
};

const statusColors: Record<string, string> = {
  pending_bcc: "secondary",
  payment_due: "default",
  registration: "default",
  inspection_scheduled: "warning",
  snagging: "destructive",
  ready_for_handover: "success",
  completed: "outline",
};

interface Handover {
  id: string;
  unit_number: string;
  project_name: string;
  buyer_name: string;
  status: string;
  scheduled_date?: string;
}

export default function HandoversPage() {
  const locale = useLocale();
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/handovers")
      .then((r) => r.json())
      .then((data) => {
        setHandovers(data.handovers || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <KeyRound className="h-6 w-6" />
          Handover Management
        </h1>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Active Handovers</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : handovers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground space-y-4">
              <p>No handovers found. Create one from a confirmed transaction.</p>
              <Link href={`/${locale}/sales`}>
                <Button variant="outline" size="sm">Go to Sales</Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Buyer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>BCC</TableHead>
                  <TableHead>Inspection</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {handovers.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-medium">{h.unit_number}</TableCell>
                    <TableCell>{h.project_name}</TableCell>
                    <TableCell>
                      <div>{h.buyer_name}</div>
                      <div className="text-xs text-muted-foreground">{h.buyer_phone}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={(statusColors[h.status] as "default" | "secondary" | "destructive" | "outline" | null | undefined) || "secondary"}>
                        {statusLabels[h.status] || h.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {h.bcc_uploaded_at ? (
                        <span className="text-green-600 text-sm">Uploaded</span>
                      ) : (
                        <span className="text-muted-foreground text-sm">Pending</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {h.inspection_date
                        ? new Date(h.inspection_date).toLocaleDateString()
                        : "Not scheduled"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/${locale}/handovers/${h.id}`}>
                        <Button variant="ghost" size="icon">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
