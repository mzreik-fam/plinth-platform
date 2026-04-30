"use client";

import {useState} from "react";
import {useTranslations, useLocale} from "next-intl";
import {useRouter} from "next/navigation";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Card, CardContent} from "@/components/ui/card";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {ArrowLeft, Loader2, Mail} from "lucide-react";
import Link from "next/link";
import {toast} from "sonner";



const roleOptions = [
  {value: "super_admin", label: "Super Admin"},
  {value: "project_manager", label: "Project Manager"},
  {value: "admin", label: "Admin"},
  {value: "internal_agent", label: "Internal Agent"},
  {value: "agency_admin", label: "Agency Admin"},
  {value: "agency_agent", label: "Agency Agent"},
];

export default function NewUserPage() {
  const t = useTranslations("users");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [form, setForm] = useState({
    username: "",
    email: "",
    fullName: "",
    role: "internal_agent",
  });
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(form),
      });

      if (res.ok) {
        toast.success("Invitation sent successfully");
        setSent(true);
      } else {
        const data = await res.json();
        toast.error(data.error || tc("error"));
      }
    } catch {
      toast.error(tc("error"));
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <div className="flex items-center gap-2">
          <Link href={`/${locale}/users`}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Invitation Sent</h1>
            <p className="text-sm text-muted-foreground">The user will receive an email to set up their account</p>
          </div>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <Mail className="h-6 w-6 text-green-600" />
            </div>
            <p className="text-lg font-medium">Invitation sent to <strong>{form.email}</strong></p>
            <p className="text-sm text-muted-foreground mt-2 max-w-sm">
              They will receive an email with a link to create their password. The link expires in 7 days.
            </p>
            <div className="flex gap-3 mt-6">
              <Link href={`/${locale}/users`}>
                <Button variant="outline">Back to Users</Button>
              </Link>
              <Button onClick={() => {setSent(false); setForm({username: "", email: "", fullName: "", role: "internal_agent"});}}>
                Invite Another
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Link href={`/${locale}/users`}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Invite User</h1>
          <p className="text-sm text-muted-foreground">Send an invitation email to a new team member</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("fullName")} *</Label>
              <Input value={form.fullName} onChange={(e) => setForm({...form, fullName: e.target.value})} required className="h-11" placeholder="e.g., John Smith" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("username")} *</Label>
                <Input value={form.username} onChange={(e) => setForm({...form, username: e.target.value})} required className="h-11" placeholder="e.g., johnsmith" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("role")}</Label>
                <Select value={form.role} onValueChange={(v) => setForm({...form, role: v || "internal_agent"})}>
                  <SelectTrigger className="h-11">
                    <SelectValue>
                      {roleOptions.find((r) => r.value === form.role)?.label}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {roleOptions.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("email")} *</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} required className="h-11" placeholder="john@example.com" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading} className="h-11 px-6 gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Mail className="h-4 w-4" /> Send Invitation</>}
              </Button>
              <Link href={`/${locale}/users`}>
                <Button variant="outline" className="h-11 px-6">{tc("cancel")}</Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
