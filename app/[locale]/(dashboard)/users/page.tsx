"use client";

import {useEffect, useState} from "react";
import {useTranslations, useLocale} from "next-intl";
import Link from "next/link";
import {Button} from "@/components/ui/button";
import {Card, CardContent} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Plus, UserCircle, Loader2, Trash2} from "lucide-react";

export default function UsersPage() {
  const t = useTranslations("users");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
    } catch {
      alert(t("revokeError"));
    }
  }

  function getStatusBadge(user: any) {
    if (user.invite_token) {
      return (
        <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-600">
          {t("pending")}
        </Badge>
      );
    }
    return (
      <Badge variant={user.is_active ? "default" : "secondary"} className="text-xs">
        {user.is_active ? t("active") : t("inactive")}
      </Badge>
    );
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
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {users.map((user: any) => (
            <Card key={user.id} className="group hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-primary">
                      {user.full_name?.charAt(0)?.toUpperCase() || "?"}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-base truncate">{user.full_name}</p>
                    <p className="text-sm text-muted-foreground">@{user.username}</p>
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("email")}</span>
                    <span className="truncate max-w-[180px]">{user.email}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("role")}</span>
                    <span className="capitalize font-medium">{user.role.replace(/_/g, " ")}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t">
                  {getStatusBadge(user)}
                  <div className="flex items-center gap-2">
                    {user.invite_token && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => revokeUser(user.id)}
                        title={t("revokeInvitation")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {new Date(user.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
