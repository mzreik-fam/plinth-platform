"use client";

import {useEffect, useState, useCallback} from "react";
import {useParams} from "next/navigation";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Building2, CalendarDays, Upload, FileCheck, AlertCircle} from "lucide-react";

interface PortalData {
  transaction: {
    id: string;
    status: string;
    project_name: string;
    unit_number: string;
    unit_type: string;
    area_sqft?: number;
    total_price: number;
    booking_date?: string;
    payment_plan_milestones?: Array<{
      label: string;
      percent: number;
      due_days_from_booking: number;
    }>;
  };
  payments: Array<{
    id: string;
    amount: number;
    payment_method: string;
    status: string;
    created_at: string;
  }>;
  totalPaid: number;
  remainingBalance: number;
}

interface UploadedDoc {
  id: string;
  file_name: string;
  category: string;
}

const paymentMethodLabels: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  cheque: "Cheque",
  cash: "Cash",
  card: "Card",
};

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export default function PortalPage() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDescription, setUploadDescription] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);

  useEffect(() => {
    fetch(`/api/portal/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((data) => {
        setData(data);
        setLoading(false);
        // Fetch documents if transaction exists
        if (data.transaction?.id) {
          fetchDocuments(data.transaction.id);
        }
      })
      .catch(() => {
        setError("Invalid or expired portal link.");
        setLoading(false);
      });
  }, [token]);

  const fetchDocuments = async (transactionId: string) => {
    try {
      const res = await fetch(`/api/portal/${token}/documents`);
      if (res.ok) {
        const docs = await res.json();
        setUploadedDocs(docs);
      }
    } catch {
      // Silently fail - documents are optional display
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      validateAndSetFile(files[0]);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      validateAndSetFile(files[0]);
    }
  };

  const validateAndSetFile = (file: File) => {
    setUploadError("");
    setUploadSuccess(false);

    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError("Invalid file type. Please upload PDF, JPG, or PNG only.");
      return;
    }

    // Validate file size (10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      setUploadError("File too large. Maximum size is 10MB.");
      return;
    }

    setUploadFile(file);
  };

  const handleUpload = async () => {
    if (!uploadFile) {
      setUploadError("Please select a file to upload.");
      return;
    }

    setIsUploading(true);
    setUploadError("");
    setUploadSuccess(false);

    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("token", token);
      formData.append("description", uploadDescription);

      const res = await fetch("/api/portal/upload", {
        method: "POST",
        body: formData,
      });

      const result = await res.json();

      if (!res.ok) {
        setUploadError(result.error || "Upload failed. Please try again.");
      } else {
        setUploadSuccess(true);
        setUploadFile(null);
        setUploadDescription("");
        // Refresh documents list
        if (data?.transaction?.id) {
          fetchDocuments(data.transaction.id);
        }
      }
    } catch {
      setUploadError("Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (error) return <div className="p-8 text-center text-destructive">{error}</div>;
  if (!data) return null;

  const {transaction, payments, totalPaid, remainingBalance} = data;
  const milestones = transaction.payment_plan_milestones || [];

  // Don't show upload for cancelled/terminated transactions
  const canUpload = transaction.status !== 'cancelled' && transaction.status !== 'terminated';

  return (
    <div className="min-h-screen bg-muted/40 p-4">
      <div className="max-w-md mx-auto space-y-4">
        {/* Header */}
        <div className="text-center py-6">
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-sm">
              <Building2 className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="text-left">
              <h1 className="text-2xl font-bold">Plinth</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Buyer Portal</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{transaction.project_name}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Unit Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Unit</span>
              <span className="font-medium">{transaction.unit_number}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Type</span>
              <span className="capitalize">{transaction.unit_type}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Area</span>
              <span>{transaction.area_sqft ? `${transaction.area_sqft} sqft` : "—"}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Financial Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Price</span>
              <span className="font-medium">AED {Number(transaction.total_price).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Paid</span>
              <span className="font-medium text-green-600">AED {Number(totalPaid).toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Remaining</span>
              <span className="font-medium">AED {Number(remainingBalance).toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>

        {/* Upload Section */}
        {canUpload && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-4 w-4 text-muted-foreground" />
                Upload Payment Proof
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {uploadSuccess && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-2">
                  <FileCheck className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-green-800">Upload successful!</p>
                    <p className="text-xs text-green-600">Your document has been sent for admin review.</p>
                  </div>
                </div>
              )}

              {uploadError && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive">{uploadError}</p>
                </div>
              )}

              {/* Drag and Drop Area */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`
                  border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer
                  ${isDragOver 
                    ? 'border-primary bg-primary/5' 
                    : 'border-muted-foreground/25 hover:border-muted-foreground/50'
                  }
                `}
                onClick={() => document.getElementById('file-input')?.click()}
              >
                <input
                  id="file-input"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {uploadFile ? (
                    <span className="font-medium text-foreground">{uploadFile.name}</span>
                  ) : (
                    <>
                      <span className="font-medium">Click to upload</span> or drag and drop
                    </>
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  PDF, JPG, PNG up to 10MB
                </p>
              </div>

              {/* Description */}
              <div>
                <label className="text-sm font-medium mb-1 block">Description (optional)</label>
                <textarea
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  placeholder="e.g., Payment for Installment 1 - Bank Transfer Ref #12345"
                  className="w-full px-3 py-2 border rounded-md text-sm min-h-[80px] resize-none"
                  maxLength={500}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {uploadDescription.length}/500 characters
                </p>
              </div>

              {/* Upload Button */}
              <Button
                onClick={handleUpload}
                disabled={!uploadFile || isUploading}
                className="w-full"
              >
                {isUploading ? (
                  <>
                    <span className="animate-spin mr-2">⟳</span>
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Document
                  </>
                )}
              </Button>

              {/* Uploaded Documents List */}
              {uploadedDocs.length > 0 && (
                <div className="pt-4 border-t">
                  <p className="text-sm font-medium mb-2">Previously Uploaded</p>
                  <div className="space-y-2">
                    {uploadedDocs.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-2 text-sm">
                        <FileCheck className="h-4 w-4 text-green-600" />
                        <span className="flex-1 truncate">{doc.file_name}</span>
                        <Badge variant="outline" className="text-xs">
                          {doc.category === 'proof_of_transfer' ? 'Payment Proof' : doc.category}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Payment Schedule */}
        {milestones.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                Payment Schedule
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {milestones.map((m, i) => {
                const dueDate = transaction.booking_date
                  ? new Date(new Date(transaction.booking_date).getTime() + m.due_days_from_booking * 24 * 60 * 60 * 1000)
                  : null;
                return (
                  <div key={i} className="flex justify-between items-center py-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">{m.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.percent}% of total price
                        {dueDate ? ` · Due ${dueDate.toLocaleDateString()}` : ""}
                      </p>
                    </div>
                    <span className="text-sm font-medium">
                      AED {Math.round(Number(transaction.total_price) * (m.percent / 100)).toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {payments.length === 0 && <p className="text-sm text-muted-foreground">No payments yet.</p>}
            {payments.map((p) => (
              <div key={p.id} className="flex justify-between items-center py-2 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium">AED {Number(p.amount).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{paymentMethodLabels[p.payment_method] || p.payment_method} · {new Date(p.created_at).toLocaleDateString()}</p>
                </div>
                <Badge variant="outline">{capitalize(p.status)}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
