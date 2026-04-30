"use client";

import {useState} from "react";
import {useTranslations, useLocale} from "next-intl";
import {useRouter} from "next/navigation";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Card, CardContent} from "@/components/ui/card";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select";
import {ArrowLeft, Loader2} from "lucide-react";
import Link from "next/link";

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
    password: "",
    fullName: "",
    role: "internal_agent",
  });
  const [loading, setLoading] = useState(false);

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
        router.push(`/${locale}/users`);
      } else {
        const data = await res.json();
        alert(data.error || tc("error"));
      }
    } catch {
      alert(tc("error"));
    } finally {
      setLoading(false);
    }
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
          <h1 className="text-2xl font-bold tracking-tight">{t("newUser")}</h1>
          <p className="text-sm text-muted-foreground">Add a new team member</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("fullName")} *</Label>
              <Input value={form.fullName} onChange={(e) => setForm({...form, fullName: e.target.value})} required className="h-11" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("username")} *</Label>
                <Input value={form.username} onChange={(e) => setForm({...form, username: e.target.value})} required className="h-11" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">{t("role")}</Label>
                <Select value={form.role} onValueChange={(v) => setForm({...form, role: v || "internal_agent"})}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
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
              <Input type="email" value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} required className="h-11" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Password *</Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({...form, password: e.target.value})} required minLength={6} className="h-11" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={loading} className="h-11 px-6">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : tc("save")}
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
