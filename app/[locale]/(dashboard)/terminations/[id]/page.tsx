"use client";

import {useEffect, useState} from "react";
import {useLocale} from "next-intl";
import Link from "next/link";
import {useParams} from "next/navigation";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {AlertTriangle, CheckCircle2, ArrowLeft} from "lucide-react";
import {toast} from "sonner";

const stepDescriptions = [
  "Completion Notice (CN) — Day 0",
  "Developer Notice (DN) — Day 30",
  "DLD Termination Notice — Day 60",
  "Execution Request to DLD — Day 90",
];

export default function TerminationDetailPage() {
  const locale = useLocale();
  const params = useParams();
  const id = params.id as string;
  const [terminationCase, setTerminationCase] = useState<any>(null);
  const [steps, setSteps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [stepForms, setStepForms] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!id) return;
    loadData();
  }, [id]);

  async function loadData() {
    const res = await fetch(`/api/terminations/${id}`);
    const data = await res.json();
    setTerminationCase(data.case);
    setSteps(data.steps || []);
    // Initialize step forms from loaded data
    const forms: Record<string, any> = {};
    (data.steps || []).forEach((step: any) => {
      forms[step.id] = {
        notice_sent_at: step.notice_sent_at || "",
        notice_method: step.notice_method || "",
        courier_tracking: step.courier_tracking || "",
        receipt_confirmed_at: step.receipt_confirmed_at || "",
        notes: step.notes || "",
      };
    });
    setStepForms(forms);
    setLoading(false);
  }

  async function saveStep(stepId: string) {
    setUpdating(true);
    const form = stepForms[stepId];
    const updates: any = {};
    if (form.notice_sent_at) updates.notice_sent_at = form.notice_sent_at;
    if (form.notice_method) updates.notice_method = form.notice_method;
    if (form.courier_tracking) updates.courier_tracking = form.courier_tracking;
    if (form.receipt_confirmed_at) updates.receipt_confirmed_at = form.receipt_confirmed_at;
    if (form.notes) updates.notes = form.notes;

    await fetch(`/api/termination-steps/${stepId}`, {
      method: "PATCH",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(updates),
    });
    await loadData();
    setUpdating(false);
    toast.success("Step details saved");
  }

  if (loading) return <div className="text-center py-8">Loading...</div>;
  if (!terminationCase) return <div className="text-center py-8">Case not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/${locale}/terminations`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">Termination: {terminationCase.unit_number}</h1>
        <Badge variant={terminationCase.status === "active" ? "destructive" : "outline"}>
          {terminationCase.status}
        </Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Unit & Buyer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <InfoRow label="Unit" value={terminationCase.unit_number} />
            <InfoRow label="Project" value={terminationCase.project_name} />
            <InfoRow label="Buyer" value={terminationCase.buyer_name} />
            <InfoRow label="Email" value={terminationCase.buyer_email} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Financial Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <InfoRow label="Total Price" value={`AED ${Number(terminationCase.total_price).toLocaleString()}`} />
            <InfoRow label="Total Paid" value={`AED ${Number(terminationCase.total_paid).toLocaleString()}`} />
            <InfoRow label="Deduction" value={`AED ${Number(terminationCase.deduction_amount).toLocaleString()}`} />
            <InfoRow label="Refund" value={`AED ${Number(terminationCase.refund_amount).toLocaleString()}`} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Case Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <InfoRow label="Reason" value={terminationCase.reason || "Not specified"} />
            <InfoRow label="Current Step" value={`${terminationCase.current_step} of 4`} />
            <InfoRow label="Created" value={new Date(terminationCase.created_at).toLocaleDateString()} />
          </CardContent>
        </Card>
      </div>

      {/* DLD 4-Step Process */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            DLD Termination Process
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {steps.map((step, index) => {
            const isLocked = index > 0 && steps[index - 1].status !== "completed";
            const isCompleted = step.status === "completed";
            const isCurrent = !isLocked && !isCompleted;

            return (
              <div
                key={step.id}
                className={`p-4 rounded-lg border ${
                  isCompleted ? "bg-green-50 border-green-200 dark:bg-green-950/20" :
                  isCurrent ? "bg-blue-50 border-blue-200 dark:bg-blue-950/20" :
                  "bg-muted/50 border-muted"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      isCompleted ? "bg-green-500 text-white" :
                      isCurrent ? "bg-blue-500 text-white" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : step.step_number}
                    </div>
                    <div>
                      <p className="font-semibold">{step.step_name}</p>
                      <p className="text-sm text-muted-foreground">{stepDescriptions[index]}</p>
                      {step.deadline_date && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Deadline: {new Date(step.deadline_date).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge variant={isCompleted ? "outline" : isCurrent ? "default" : "secondary"}>
                    {isLocked ? "Locked" : step.status}
                  </Badge>
                </div>

                {!isLocked && !isCompleted && (
                  <div className="mt-4 pl-11 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Notice Sent At</Label>
                        <Input
                          type="datetime-local"
                          disabled={updating}
                          value={stepForms[step.id]?.notice_sent_at || ""}
                          onChange={(e) => setStepForms({...stepForms, [step.id]: {...stepForms[step.id], notice_sent_at: e.target.value}})}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Notice Method</Label>
                        <Input
                          placeholder="Email + Courier"
                          disabled={updating}
                          value={stepForms[step.id]?.notice_method || ""}
                          onChange={(e) => setStepForms({...stepForms, [step.id]: {...stepForms[step.id], notice_method: e.target.value}})}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Courier Tracking</Label>
                        <Input
                          placeholder="Tracking number"
                          disabled={updating}
                          value={stepForms[step.id]?.courier_tracking || ""}
                          onChange={(e) => setStepForms({...stepForms, [step.id]: {...stepForms[step.id], courier_tracking: e.target.value}})}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Receipt Confirmed</Label>
                        <Input
                          type="datetime-local"
                          disabled={updating}
                          value={stepForms[step.id]?.receipt_confirmed_at || ""}
                          onChange={(e) => setStepForms({...stepForms, [step.id]: {...stepForms[step.id], receipt_confirmed_at: e.target.value}})}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Notes</Label>
                      <Input
                        placeholder="Add notes..."
                        disabled={updating}
                        value={stepForms[step.id]?.notes || ""}
                        onChange={(e) => setStepForms({...stepForms, [step.id]: {...stepForms[step.id], notes: e.target.value}})}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={updating}
                        onClick={() => saveStep(step.id)}
                      >
                        Save Details
                      </Button>
                      <Button
                        size="sm"
                        disabled={updating}
                        onClick={() => saveStep(step.id)}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Mark Step Complete
                      </Button>
                    </div>
                  </div>
                )}

                {isCompleted && (
                  <div className="mt-3 pl-11 text-sm text-muted-foreground">
                    {step.notice_sent_at && <p>Notice sent: {new Date(step.notice_sent_at).toLocaleString()}</p>}
                    {step.courier_tracking && <p>Tracking: {step.courier_tracking}</p>}
                    {step.completed_at && <p>Completed: {new Date(step.completed_at).toLocaleString()}</p>}
                  </div>
                )}
              </div>
            );
          })}
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
