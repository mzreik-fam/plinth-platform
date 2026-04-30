"use client";

import {useEffect, useState} from "react";
import {useTranslations, useLocale} from "next-intl";
import Link from "next/link";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Card, CardContent} from "@/components/ui/card";
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
import {Label} from "@/components/ui/label";
import {Plus, Users, Loader2, Mail, Phone, Globe, Search, ShoppingCart, Pencil, Trash2} from "lucide-react";
import {toast} from "sonner";

export default function BuyersPage() {
  const t = useTranslations("buyers");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [buyers, setBuyers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const [editBuyer, setEditBuyer] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOffset(0);
    fetchBuyers(0);
  }, [search]);

  async function fetchBuyers(newOffset: number) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      params.set("limit", String(limit));
      params.set("offset", String(newOffset));
      const res = await fetch(`/api/buyers?${params.toString()}`);
      const data = await res.json();
      setBuyers(data.buyers || []);
      setTotal(data.total || 0);
      setOffset(newOffset);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function deleteBuyer(id: string) {
    if (!confirm("Are you sure you want to delete this buyer?")) return;
    try {
      const res = await fetch(`/api/buyers/${id}`, {method: "DELETE"});
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to delete buyer");
        return;
      }
      fetchBuyers(offset);
      toast.success("Buyer deleted");
    } catch {
      toast.error("Failed to delete buyer");
    }
  }

  function openEdit(buyer: any) {
    setEditBuyer(buyer);
    setEditForm({
      fullName: buyer.full_name,
      email: buyer.email,
      phone: buyer.phone,
      emiratesId: buyer.emirates_id,
      passportNumber: buyer.passport_number,
      nationality: buyer.nationality,
      address: buyer.address,
    });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editBuyer) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/buyers/${editBuyer.id}`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        toast.success("Buyer updated");
        setEditBuyer(null);
        fetchBuyers(offset);
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground mt-1">Manage buyers and their contact information</p>
        </div>
        <Link href={`/${locale}/buyers/new`}>
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            {t("newBuyer")}
          </Button>
        </Link>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, phone, or Emirates ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 max-w-md"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : buyers.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="h-10 w-10 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground font-medium">No buyers yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Add your first buyer to get started</p>
            <Link href={`/${locale}/buyers/new`} className="mt-4">
              <Button variant="outline" className="gap-2">
                <Plus className="h-4 w-4" />
                {t("newBuyer")}
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Nationality</TableHead>
                    <TableHead>Emirates ID</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {buyers.map((buyer: any) => (
                    <TableRow key={buyer.id}>
                      <TableCell className="font-medium">{buyer.full_name}</TableCell>
                      <TableCell>{buyer.phone}</TableCell>
                      <TableCell>{buyer.email || "—"}</TableCell>
                      <TableCell>{buyer.nationality || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{buyer.emirates_id || "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Link href={`/${locale}/sales?buyerId=${buyer.id}`}>
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="View transactions">
                              <ShoppingCart className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(buyer)} title="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteBuyer(buyer.id)} title="Delete">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Pagination */}
          {total > limit && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">
                Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => fetchBuyers(offset - limit)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset + limit >= total}
                  onClick={() => fetchBuyers(offset + limit)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={!!editBuyer} onOpenChange={(open) => !open && setEditBuyer(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Buyer</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveEdit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={editForm.fullName || ""} onChange={(e) => setEditForm({...editForm, fullName: e.target.value})} required />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={editForm.phone || ""} onChange={(e) => setEditForm({...editForm, phone: e.target.value})} required />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={editForm.email || ""} onChange={(e) => setEditForm({...editForm, email: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Emirates ID</Label>
              <Input value={editForm.emiratesId || ""} onChange={(e) => setEditForm({...editForm, emiratesId: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Passport Number</Label>
              <Input value={editForm.passportNumber || ""} onChange={(e) => setEditForm({...editForm, passportNumber: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Nationality</Label>
              <Input value={editForm.nationality || ""} onChange={(e) => setEditForm({...editForm, nationality: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input value={editForm.address || ""} onChange={(e) => setEditForm({...editForm, address: e.target.value})} />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : tc("save")}</Button>
              <Button type="button" variant="outline" onClick={() => setEditBuyer(null)}>{tc("cancel")}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
