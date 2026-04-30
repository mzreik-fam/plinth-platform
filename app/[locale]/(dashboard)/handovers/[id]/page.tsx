"use client";

import {useEffect, useState} from "react";
import {useLocale, useTranslations} from "next-intl";
import Link from "next/link";
import {useParams} from "next/navigation";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Label} from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {KeyRound, CheckCircle2, Upload, Wrench, ArrowLeft} from "lucide-react";

const statusLabels: Record<string, string> = {
  pending_bcc: "Pending BCC",
  payment_due: "Payment Due",
  registration: "Registration",
  inspection_scheduled: "Inspection Scheduled",
  snagging: "Snagging",
  ready_for_handover: "Ready for Handover",
  completed: "Completed",
};

const severityLabels: Record<string, string> = {
  minor: "Minor",
  major: "Major",
  critical: "Critical",
};

const ticketStatusLabels: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

const statusSteps = [
  "pending_bcc",
  "payment_due",
  "registration",
  "inspection_scheduled",
  "snagging",
  "ready_for_handover",
  "completed",
];

export default function HandoverDetailPage() {
  const locale = useLocale();
  const params = useParams();
  const id = params.id as string;
  const [handover, setHandover] = useState<any>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [newTicket, setNewTicket] = useState({title: "", description: "", severity: "minor"});

  useEffect(() => {
    if (!id) return;
    fetch(`/api/handovers/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setHandover(data.handover);
        setTickets(data.tickets || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  async function updateHandover(updates: any) {
    setUpdating(true);
    const res = await fetch(`/api/handovers/${id}`, {
      method: "PATCH",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (data.handover) setHandover(data.handover);
    setUpdating(false);
  }

  async function createTicket() {
    if (!newTicket.title) return;
    const res = await fetch("/api/snagging-tickets", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        handover_id: id,
        unit_id: handover.unit_id,
        title: newTicket.title,
        description: newTicket.description,
        severity: newTicket.severity,
      }),
    });
    const data = await res.json();
    if (data.ticket) {
      setTickets([data.ticket, ...tickets]);
      setNewTicket({title: "", description: "", severity: "minor"});
      // Update handover status to snagging if not already
      if (handover.status !== "snagging" && handover.status !== "ready_for_handover" && handover.status !== "completed") {
        updateHandover({status: "snagging"});
      }
    }
  }

  async function updateTicket(ticketId: string, status: string) {
    await fetch(`/api/snagging-tickets/${ticketId}`, {
      method: "PATCH",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({status}),
    });
    setTickets(tickets.map((t) => (t.id === ticketId ? {...t, status} : t)));
  }

  const currentStepIndex = statusSteps.indexOf(handover?.status || "pending_bcc");

  if (loading) return <div className="text-center py-8">Loading...</div>;
  if (!handover) return <div className="text-center py-8">Handover not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/${locale}/handovers`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Handover: {handover.unit_number}</h1>
        <Badge variant="secondary">{statusLabels[handover.status]}</Badge>
      </div>

      {/* Progress Steps */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            {statusSteps.map((step, i) => (
              <div key={step} className="flex flex-col items-center gap-2 flex-1">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    i <= currentStepIndex
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {i < currentStepIndex ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                </div>
                <span className="text-xs text-center hidden md:block">{statusLabels[step]}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Unit & Buyer Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Unit & Buyer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="Unit" value={handover.unit_number} />
            <InfoRow label="Project" value={handover.project_name} />
            <InfoRow label="Buyer" value={handover.buyer_name} />
            <InfoRow label="Email" value={handover.buyer_email} />
            <InfoRow label="Phone" value={handover.buyer_phone} />
            <InfoRow label="Total Price" value={`AED ${Number(handover.total_price).toLocaleString()}`} />
          </CardContent>
        </Card>

        {/* Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Manage Handover</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!handover.bcc_uploaded_at && (
              <Button
                className="w-full"
                onClick={() => updateHandover({bcc_uploaded_at: new Date().toISOString(), status: "payment_due"})}
                disabled={updating}
              >
                <Upload className="h-4 w-4 mr-2" />
                Mark BCC Uploaded
              </Button>
            )}
            {handover.bcc_uploaded_at && !handover.handover_payment_paid_at && (
              <Button
                className="w-full"
                onClick={() => updateHandover({handover_payment_paid_at: new Date().toISOString(), status: "registration"})}
                disabled={updating}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Confirm Handover Payment
              </Button>
            )}
            {handover.status === "registration" && (
              <>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => updateHandover({dld_registration_confirmed: true, oqood_paid: true, status: "inspection_scheduled"})}
                  disabled={updating}
                >
                  Confirm DLD & Oqood
                </Button>
              </>
            )}
            {handover.status === "inspection_scheduled" && (
              <div className="space-y-2">
                <Label>Inspection Date</Label>
                <Input
                  type="datetime-local"
                  onBlur={(e) => {
                    if (e.target.value) {
                      updateHandover({inspection_date: e.target.value, status: "snagging"});
                    }
                  }}
                />
              </div>
            )}
            {handover.status === "ready_for_handover" && (
              <Button
                className="w-full"
                onClick={() => updateHandover({key_handover_signed_at: new Date().toISOString(), status: "completed"})}
                disabled={updating}
              >
                <KeyRound className="h-4 w-4 mr-2" />
                Complete Key Handover
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Snagging Tickets */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Snagging Tickets</CardTitle>
          <Dialog>
            <DialogTrigger>
              <Button size="sm">
                <Wrench className="h-4 w-4 mr-1" />
                Add Ticket
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Snagging Ticket</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input value={newTicket.title} onChange={(e) => setNewTicket({...newTicket, title: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={newTicket.description} onChange={(e) => setNewTicket({...newTicket, description: e.target.value})} rows={2} />
                </div>
                <div className="space-y-2">
                  <Label>Severity</Label>
                  <Select value={newTicket.severity} onValueChange={(v) => setNewTicket({...newTicket, severity: v || "minor"})}>
                    <SelectTrigger className="h-11"><SelectValue>{severityLabels[newTicket.severity]}</SelectValue></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minor">Minor</SelectItem>
                      <SelectItem value="major">Major</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" onClick={createTicket}>Create Ticket</Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {tickets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No snagging tickets yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>{t.title}</TableCell>
                    <TableCell>
                      <Badge variant={t.severity === "critical" ? "destructive" : t.severity === "major" ? "default" : "secondary"}>
                        {severityLabels[t.severity] || t.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.status === "closed" ? "outline" : t.status === "resolved" ? "secondary" : "default"}>
                        {ticketStatusLabels[t.status] || t.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {t.status !== "closed" && (
                        <>
                          {t.status === "open" && (
                            <Button size="sm" variant="outline" onClick={() => updateTicket(t.id, "in_progress")}>
                              Start
                            </Button>
                          )}
                          {t.status === "in_progress" && (
                            <Button size="sm" variant="outline" onClick={() => updateTicket(t.id, "resolved")}>
                              Resolve
                            </Button>
                          )}
                          {t.status === "resolved" && (
                            <Button size="sm" onClick={() => updateTicket(t.id, "closed")}>
                              Close
                            </Button>
                          )}
                        </>
                      )}
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

function InfoRow({label, value}: {label: string; value: string}) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
