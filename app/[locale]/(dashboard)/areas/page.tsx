"use client";

import {useEffect, useState} from "react";
import {useLocale} from "next-intl";
import {Button} from "@/components/ui/button";
import {Card, CardContent} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {Plus, Loader2, MapPin, Trash2} from "lucide-react";
import {toast} from "sonner";

interface Area {
  id: string;
  name: string;
}

export default function AreasPage() {
  const locale = useLocale();
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAreas();
  }, []);

  async function fetchAreas() {
    try {
      const res = await fetch("/api/areas");
      const data = await res.json();
      setAreas(data.areas || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const res = await fetch("/api/areas", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({name: name.trim()}),
    });
    if (res.ok) {
      setName("");
      setShowDialog(false);
      fetchAreas();
      toast.success("Area created");
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to create area");
    }
    setSaving(false);
  }

  async function deleteArea(id: string) {
    if (!confirm("Are you sure you want to delete this area? Projects using it will have no area assigned.")) return;
    try {
      const res = await fetch(`/api/areas/${id}`, {method: "DELETE"});
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to delete area");
        return;
      }
      fetchAreas();
      toast.success("Area deleted");
    } catch {
      toast.error("Failed to delete area");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Areas</h1>
          <p className="text-muted-foreground mt-1">Manage project locations and areas</p>
        </div>
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogTrigger>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Area
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Area</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Area Name *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Downtown Dubai"
                  required
                  className="h-11"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="submit" disabled={saving} className="h-11 px-6">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
                </Button>
                <Button type="button" variant="outline" className="h-11 px-6" onClick={() => setShowDialog(false)}>Cancel</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : areas.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <MapPin className="h-10 w-10 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground font-medium">No areas yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Create your first area to use in projects</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {areas.map((area) => (
                  <TableRow key={area.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        {area.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => deleteArea(area.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
