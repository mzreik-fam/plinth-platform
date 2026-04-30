"use client";

import {useEffect, useState} from "react";
import {useTranslations, useLocale} from "next-intl";
import Link from "next/link";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Card, CardContent} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
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
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {Label} from "@/components/ui/label";
import {Plus, UserCircle, Loader2, Pencil, Trash2, Power} from "lucide-react";
import {toast} from "sonner";

export default function UsersPage() {
  const t = useTranslations("users");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [editUser, setEditUser] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      setUsers(data.users || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function revokeUser(id: string) {
    if (!confirm(t("revokeConfirm"))) return;
    try {
      const res = await fetch(`/api/users/${id}`, {method: "DELETE"});
      if (!res.ok) throw new Error("Failed to revoke");
      setUsers((prev) => prev.filter((u) => u.id !== id));
      toast.success("Invitation revoked");
    } catch {
      toast.error(t("revokeError"));
    }
  }

  async function toggleActive(user: any) {
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({isActive: !user.is_active}),
      });
      if (res.ok) {
        toast.success(user.is_active ? "User deactivated" : "User activated");
        fetchUsers();
      } else {
        toast.error("Failed to update status");
      }
    } catch {
      toast.error("Failed to update status");
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${editUser.id}`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        toast.success("User updated");
        setEditUser(null);
        fetchUsers();
      } else {
        const data = await res.json();
        toast.error(data.error || tc("error"));
      }
    } catch {
      toast.error(tc("error"));
    } finally {
      setSaving(false);
    }
  }

  function openEdit(user: any) {
    setEditUser(user);
    setEditForm({
      fullName: user.full_name,
      email: user.email,
      role: user.role,
    });
  }

  function getStatusBadge(user: any) {
    if (user.invite_token) {
      return <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-600">{t("pending")}</Badge>;
    }
    return <Badge variant={user.is_active ? "default" : "secondary"} className="text-xs">{user.is_active ? t("active") : t("inactive")}</Badge>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground mt-1">Manage team members and access levels</p>
        </div>
        <Link href={`/${locale}/users/new`}>
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            {t("newUser")}
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : users.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <UserCircle className="h-10 w-10 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground font-medium">No users yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Add your first team member</p>
            <Link href={`/${locale}/users/new`} className="mt-4">
              <Button variant="outline" className="gap-2">
                <Plus className="h-4 w-4" />
                {t("newUser")}
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("fullName")}</TableHead>
                  <TableHead>{t("username")}</TableHead>
                  <TableHead>{t("email")}</TableHead>
                  <TableHead>{t("role")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user: any) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.full_name}</TableCell>
                    <TableCell>@{user.username}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell className="capitalize">{user.role.replace(/_/g, " ")}</TableCell>
                    <TableCell>{getStatusBadge(user)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(user)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {!user.invite_token && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleActive(user)} title={user.is_active ? "Deactivate" : "Activate"}>
                            <Power className={`h-4 w-4 ${user.is_active ? "text-orange-500" : "text-green-500"}`} />
                          </Button>
                        )}
                        {user.invite_token && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => revokeUser(user.id)} title={t("revokeInvitation")}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveEdit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>{t("fullName")}</Label>
              <Input value={editForm.fullName || ""} onChange={(e) => setEditForm({...editForm, fullName: e.target.value})} required />
            </div>
            <div className="space-y-2">
              <Label>{t("email")}</Label>
              <Input type="email" value={editForm.email || ""} onChange={(e) => setEditForm({...editForm, email: e.target.value})} required />
            </div>
            <div className="space-y-2">
              <Label>{t("role")}</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm({...editForm, role: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                  <SelectItem value="project_manager">Project Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="internal_agent">Internal Agent</SelectItem>
                  <SelectItem value="agency_admin">Agency Admin</SelectItem>
                  <SelectItem value="agency_agent">Agency Agent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : tc("save")}</Button>
              <Button type="button" variant="outline" onClick={() => setEditUser(null)}>{tc("cancel")}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
