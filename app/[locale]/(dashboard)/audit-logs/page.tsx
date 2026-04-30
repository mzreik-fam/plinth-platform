"use client";

import {useEffect, useState} from "react";
import {Card, CardContent, CardHeader, CardTitle} from "@/components/ui/card";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {Loader2, ClipboardList} from "lucide-react";

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const limit = 50;

  useEffect(() => {
    fetchLogs(0);
  }, []);

  async function fetchLogs(newOffset: number) {
    setLoading(true);
    try {
      const res = await fetch(`/api/audit-logs?limit=${limit}&offset=${newOffset}`);
      const data = await res.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setOffset(newOffset);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  const actionColors: Record<string, string> = {
    create: "bg-green-50 text-green-700 border-green-200",
    update: "bg-blue-50 text-blue-700 border-blue-200",
    delete: "bg-red-50 text-red-700 border-red-200",
    approve: "bg-purple-50 text-purple-700 border-purple-200",
    reject: "bg-orange-50 text-orange-700 border-orange-200",
    login: "bg-gray-50 text-gray-700 border-gray-200",
    invite: "bg-yellow-50 text-yellow-700 border-yellow-200",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
        <p className="text-muted-foreground mt-1">Track all system activities and changes</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : logs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ClipboardList className="h-10 w-10 text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground font-medium">No audit logs yet</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log: any) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs capitalize ${actionColors[log.action] || ""}`}>
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="capitalize">{log.entity_type}</span>
                        {log.entity_id && <span className="text-muted-foreground text-xs ml-1">· {log.entity_id.slice(0, 8)}</span>}
                      </TableCell>
                      <TableCell className="text-sm max-w-xs truncate">
                        {log.details || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {log.performed_by?.slice(0, 8) || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {total > limit && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">
                Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => fetchLogs(offset - limit)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={offset + limit >= total} onClick={() => fetchLogs(offset + limit)}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
