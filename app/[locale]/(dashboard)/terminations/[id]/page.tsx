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
import {AlertTriangle, CheckCircle2, ArrowLeft, Loader2, Upload, FileText} from "lucide-react";
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
  const [saving, setSaving] = useState(false);
  const [stepForms, setStepForms] = useState<Record<string, any>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!id) return;
    loadData();
  }, [id]);

  async function loadData() {
    const res = await fetch(`/api/terminations/${id}`);
    const data = await res.json();
    setTerminationCase(data.case);
    setSteps(data.steps || []);
    const forms: Record<string, any> = {};
    (data.steps || []).forEach((step: any) => {
      forms[step.id] = {
        notice_sent_at: step.notice_sent_at ? formatDateTimeLocal(step.notice_sent_at) : "",
        notice_method: step.notice_method || "",
        courier_tracking: step.courier_tracking || "",
        receipt_confirmed_at: step.receipt_confirmed_at ? formatDateTimeLocal(step.receipt_confirmed_at) : "",
        airway_bill_url: step.airway_bill_url || "",
        email_proof_url: step.email_proof_url || "",
        notes: step.notes || "",
      };
    });
    setStepForms(forms);
    setDirty(false);
    setLoading(false);
  }

  function formatDateTimeLocal(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toISOString().slice(0, 16);
  }

  async function saveAll() {
    setSaving(true);
    try {
      const promises = steps
        .filter((step) => !step.completed_at)
        .map(async (step) => {
          const form = stepForms[step.id];
          if (!form) return;
          const updates: any = {};
          if (form.notice_sent_at) updates.notice_sent_at = form.notice_sent_at;
          if (form.notice_method) updates.notice_method = form.notice_method;
          if (form.courier_tracking) updates.courier_tracking = form.courier_tracking;
          if (form.receipt_confirmed_at) updates.receipt_confirmed_at = form.receipt_confirmed_at;
          if (form.airway_bill_url) updates.airway_bill_url = form.airway_bill_url;
          if (form.email_proof_url) updates.email_proof_url = form.email_proof_url;
          if (form.notes) updates.notes = form.notes;

          if (Object.keys(updates).length === 0) return;

          return fetch(`/api/termination-steps/${step.id}`, {
            method: "PATCH",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(updates),
          });
        });

      await Promise.all(promises);
      await loadData();
      toast.success("All step details saved");
    } catch {
      toast.error("Failed to save steps");
    } finally {
      setSaving(false);
    }
  }

  async function completeStep(stepId: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/termination-steps/${stepId}`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({status: "completed", completed_at: new Date().toISOString()}),
      });
      
      if (!res.ok) {
        const error = await res.json();
        toast.error(error.message || error.error || "Failed to complete step");
        setSaving(false);
        return;
      }
      
      await loadData();
      toast.success("Step marked complete");
    } catch {
      toast.error("Failed to complete step");
    } finally {
      setSaving(false);
    }
  }

  function updateField(stepId: string, field: string, value: string) {
    setStepForms((prev) => ({
      ...prev,
      [stepId]: {...prev[stepId], [field]: value},
    }));
    setDirty(true);
  }

  async function handleFileUpload(stepId: string, field: 'airway_bill_url' | 'email_proof_url', file: File) {
    if (!file) return;
    
    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Only PDF, JPG, and PNG files are allowed");
      return;
    }
    
    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be less than 10MB");
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', 'termination_proof');
      
      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!uploadRes.ok) {
        throw new Error('Upload failed');
      }
      
      const uploadData = await uploadRes.json();
      updateField(stepId, field, uploadData.url);
      toast.success(`${field === 'airway_bill_url' ? 'Airway bill' : 'Email proof'} uploaded`);
    } catch {
      toast.error("Failed to upload file");
    } finally {
      setSaving(false);
    }
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
          {terminationCase.status.charAt(0).toUpperCase() + terminationCase.status.slice(1)}
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
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            DLD Termination Process
          </CardTitle>
          {dirty && (
            <Button size="sm" disabled={saving} onClick={saveAll}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save All Changes
            </Button>
          )}
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
                      {!step.deadline_date && !isCompleted && (
                        <p className="text-xs text-amber-600 mt-1">
                          Deadline will be set when prior step receipt is confirmed
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
                        <Label className="text-xs">Notice Sent At *</Label>
                        <Input
                          type="datetime-local"
                          disabled={saving}
                          value={stepForms[step.id]?.notice_sent_at || ""}
                          onChange={(e) => updateField(step.id, "notice_sent_at", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Notice Method *</Label>
                        <Input
                          placeholder="Email + Courier"
                          disabled={saving}
                          value={stepForms[step.id]?.notice_method || ""}
                          onChange={(e) => updateField(step.id, "notice_method", e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Courier Tracking</Label>
                        <Input
                          placeholder="Tracking number"
                          disabled={saving}
                          value={stepForms[step.id]?.courier_tracking || ""}
                          onChange={(e) => updateField(step.id, "courier_tracking", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Receipt Confirmed</Label>
                        <Input
                          type="datetime-local"
                          disabled={saving}
                          value={stepForms[step.id]?.receipt_confirmed_at || ""}
                          onChange={(e) => updateField(step.id, "receipt_confirmed_at", e.target.value)}
                        />
                      </div>
                    </div>
                    
                    {/* Mandatory upload fields */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs flex items-center gap-1">
                          <Upload className="h-3 w-3" />
                          Airway Bill / Proof of Delivery *
                        </Label>
                        {stepForms[step.id]?.airway_bill_url ? (
                          <div className="flex items-center gap-2 p-2 bg-green-50 rounded border">
                            <FileText className="h-4 w-4 text-green-600" />
                            <span className="text-xs text-green-700 flex-1 truncate">
                              {stepForms[step.id].airway_bill_url.split('/').pop()}
                            </span>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-6 text-xs"
                              onClick={() => updateField(step.id, "airway_bill_url", "")}
                            >
                              Remove
                            </Button>
                          </div>
                        ) : (
                          <Input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            disabled={saving}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFileUpload(step.id, 'airway_bill_url', file);
                            }}
                          />
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs flex items-center gap-1">
                          <Upload className="h-3 w-3" />
                          Email Delivery Proof *
                        </Label>
                        {stepForms[step.id]?.email_proof_url ? (
                          <div className="flex items-center gap-2 p-2 bg-green-50 rounded border">
                            <FileText className="h-4 w-4 text-green-600" />
                            <span className="text-xs text-green-700 flex-1 truncate">
                              {stepForms[step.id].email_proof_url.split('/').pop()}
                            </span>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-6 text-xs"
                              onClick={() => updateField(step.id, "email_proof_url", "")}
                            >
                              Remove
                            </Button>
                          </div>
                        ) : (
                          <Input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            disabled={saving}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFileUpload(step.id, 'email_proof_url', file);
                            }}
                          />
                        )}
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      <Label className="text-xs">Notes</Label>
                      <Input
                        placeholder="Add notes..."
                        disabled={saving}
                        value={stepForms[step.id]?.notes || ""}
                        onChange={(e) => updateField(step.id, "notes", e.target.value)}
                      />
                    </div>
                    
                    {/* Validation indicators */}
                    <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
                      <p className="font-medium mb-1">Required to mark complete:</p>
                      <ul className="space-y-1">
                        <li className={stepForms[step.id]?.airway_bill_url ? "text-green-600" : "text-amber-600"}>
                          {stepForms[step.id]?.airway_bill_url ? "✓" : "○"} Airway bill uploaded
                        </li>
                        <li className={stepForms[step.id]?.email_proof_url ? "text-green-600" : "text-amber-600"}>
                          {stepForms[step.id]?.email_proof_url ? "✓" : "○"} Email proof uploaded
                        </li>
                        {index > 0 && (
                          <li className={steps[index - 1].status === "completed" ? "text-green-600" : "text-amber-600"}>
                            {steps[index - 1].status === "completed" ? "✓" : "○"} Step {index} completed
                          </li>
                        )}
                      </ul>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={saving || !stepForms[step.id]?.airway_bill_url || !stepForms[step.id]?.email_proof_url || (index > 0 && steps[index - 1].status !== "completed")}
                        onClick={() => completeStep(step.id)}
                        title={
                          !stepForms[step.id]?.airway_bill_url || !stepForms[step.id]?.email_proof_url 
                            ? "Upload all required documents to mark complete" 
                            : (index > 0 && steps[index - 1].status !== "completed")
                              ? `Complete Step ${index} first`
                              : "Mark step as complete"
                        }
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Mark Step Complete
                      </Button>
                    </div>
                  </div>
                )}

                {isCompleted && (
                  <div className="mt-3 pl-11 text-sm text-muted-foreground space-y-1">
                    {step.notice_sent_at && <p>Notice sent: {new Date(step.notice_sent_at).toLocaleString()}</p>}
                    {step.courier_tracking && <p>Tracking: {step.courier_tracking}</p>}
                    {step.airway_bill_url && (
                      <p className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        Airway bill: <a href={step.airway_bill_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View</a>
                      </p>
                    )}
                    {step.email_proof_url && (
                      <p className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        Email proof: <a href={step.email_proof_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View</a>
                      </p>
                    )}
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
