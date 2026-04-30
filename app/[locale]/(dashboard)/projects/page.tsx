"use client";

import {useEffect, useState} from "react";
import {Button} from "@/components/ui/button";
import {Card, CardContent} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {Plus, FolderKanban, Loader2, MapPin, Building2, Pencil, Trash2} from "lucide-react";
import {toast} from "sonner";

interface Area {
  id: string;
  name: string;
}

interface Project {
  id: string;
  name: string;
  area_id?: string;
  area_name?: string;
  status: string;
}

interface EditForm {
  name: string;
  areaId: string | null;
  status: string;
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState<{name: string; areaId: string}>({name: "", areaId: ""});
  const [saving, setSaving] = useState(false);
  const [filterAreaId, setFilterAreaId] = useState<string>("all");

  const [editProject, setEditProject] = useState<Project | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({name: "", areaId: "", status: "active"});
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    fetchAreas().then(() => fetchProjects());
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [filterAreaId]);

  async function fetchAreas() {
    try {
      const res = await fetch("/api/areas");
      const data = await res.json();
      setAreas(data.areas || []);
    } catch {
      // ignore
    }
  }

  async function fetchProjects() {
    try {
      setLoading(true);
      const url = filterAreaId && filterAreaId !== "all"
        ? `/api/projects?areaId=${filterAreaId}`
        : "/api/projects";
      const res = await fetch(url);
      const data = await res.json();
      setProjects(data.projects || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({name: form.name, areaId: form.areaId || undefined}),
    });
    if (res.ok) {
      setForm({name: "", areaId: ""});
      setShowDialog(false);
      fetchProjects();
      toast.success("Project created");
    } else {
      const data = await res.json();
      toast.error(data.error || "Failed to create project");
    }
    setSaving(false);
  }

  async function deleteProject(id: string) {
    if (!confirm("Are you sure you want to delete this project?")) return;
    try {
      const res = await fetch(`/api/projects/${id}`, {method: "DELETE"});
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "Failed to delete project");
        return;
      }
      fetchProjects();
      toast.success("Project deleted");
    } catch {
      toast.error("Failed to delete project");
    }
  }

  function openEdit(project: Project) {
    setEditProject(project);
    setEditForm({
      name: project.name,
      areaId: project.area_id ?? null,
      status: project.status,
    });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editProject) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/projects/${editProject.id}`, {
        method: "PATCH",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          name: editForm.name,
          areaId: editForm.areaId || null,
          status: editForm.status,
        }),
      });
      if (res.ok) {
        toast.success("Project updated");
        setEditProject(null);
        fetchProjects();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to update project");
      }
    } catch {
      toast.error("Failed to update project");
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground mt-1">Manage real estate projects and their locations</p>
        </div>
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogTrigger>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Project
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Project Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({...form, name: e.target.value})}
                  placeholder="e.g., Marina Heights"
                  required
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Area</Label>
                <Select value={form.areaId} onValueChange={(v) => setForm({...form, areaId: v || ""})}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="Select an area">{areas.find((a) => a.id === form.areaId)?.name || "Select an area"}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {areas.map((area) => (
                      <SelectItem key={area.id} value={area.id}>{area.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

      <div className="flex items-center gap-3">
        <Select value={filterAreaId} onValueChange={(v) => setFilterAreaId(v || "all")}>
          <SelectTrigger className="w-[240px] h-10">
            <SelectValue placeholder="Filter by area">{areas.find((a) => a.id === filterAreaId)?.name || "All areas"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All areas</SelectItem>
            {areas.map((area) => (
              <SelectItem key={area.id} value={area.id}>{area.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filterAreaId && filterAreaId !== "all" && (
          <Button variant="ghost" size="sm" onClick={() => setFilterAreaId("all")}>Clear filter</Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : projects.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FolderKanban className="h-10 w-10 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground font-medium">No projects yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Create your first project to organize units</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {project.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      {project.area_name ? (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5" />
                          {project.area_name}
                        </div>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={project.status === "active" ? "default" : "secondary"} className="text-xs">
                        {project.status === "active" ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(project)} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteProject(project.id)} title="Delete">
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
      )}

      <Dialog open={!!editProject} onOpenChange={(open) => !open && setEditProject(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveEdit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Project Name</Label>
              <Input value={editForm.name || ""} onChange={(e) => setEditForm({...editForm, name: e.target.value})} required className="h-11" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Area</Label>
              <Select value={editForm.areaId ?? ""} onValueChange={(v) => setEditForm({...editForm, areaId: v || null})}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Select an area">{areas.find((a) => a.id === editForm.areaId)?.name || "None"}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {areas.map((area) => (
                    <SelectItem key={area.id} value={area.id}>{area.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Status</Label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm({...editForm, status: v || ""})}>
                <SelectTrigger className="h-11"><SelectValue>{editForm.status === "active" ? "Active" : "Inactive"}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={editSaving} className="h-11 px-6">
                {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
              <Button type="button" variant="outline" className="h-11 px-6" onClick={() => setEditProject(null)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
