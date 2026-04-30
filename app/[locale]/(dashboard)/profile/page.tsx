"use client";

import {useEffect, useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {UserCircle, Loader2, KeyRound} from "lucide-react";
import {toast} from "sonner";

const roleOptions: Record<string, string> = {
  super_admin: "Super Admin",
  project_manager: "Project Manager",
  admin: "Admin",
  internal_agent: "Internal Agent",
  agency_admin: "Agency Admin",
  agency_agent: "Agency Agent",
};

interface ProfileUser {
  id: string;
  full_name: string;
  email?: string;
  username: string;
  role: string;
}

export default function ProfilePage() {
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [passwordForm, setPasswordForm] = useState({current: "", new: "", confirm: ""});

  useEffect(() => {
    fetch("/api/users/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function updateProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        fullName: user.full_name,
        email: user.email,
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Profile updated");
    } else {
      toast.error("Failed to update profile");
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (passwordForm.new !== passwordForm.confirm) {
      toast.error("New passwords do not match");
      return;
    }
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        currentPassword: passwordForm.current,
        newPassword: passwordForm.new,
      }),
    });
    if (res.ok) {
      toast.success("Password changed");
      setPasswordForm({current: "", new: "", confirm: ""});
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "Failed to change password");
    }
  }

  if (loading) return <div className="text-muted-foreground">Loading...</div>;
  if (!user) return <div className="text-muted-foreground">Not logged in</div>;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
          <UserCircle className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Profile</h1>
          <p className="text-sm text-muted-foreground">Manage your account settings</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={updateProfile} className="space-y-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={user.full_name} onChange={(e) => setUser({...user, full_name: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={user.email || ""} onChange={(e) => setUser({...user, email: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Username</Label>
              <Input value={user.username} disabled />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Badge variant="secondary">{roleOptions[user.role] || user.role}</Badge>
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            Change Password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="space-y-4">
            <div className="space-y-2">
              <Label>Current Password</Label>
              <Input type="password" value={passwordForm.current} onChange={(e) => setPasswordForm({...passwordForm, current: e.target.value})} required />
            </div>
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input type="password" value={passwordForm.new} onChange={(e) => setPasswordForm({...passwordForm, new: e.target.value})} required />
            </div>
            <div className="space-y-2">
              <Label>Confirm New Password</Label>
              <Input type="password" value={passwordForm.confirm} onChange={(e) => setPasswordForm({...passwordForm, confirm: e.target.value})} required />
            </div>
            <Button type="submit">Change Password</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
