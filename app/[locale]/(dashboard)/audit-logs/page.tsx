"use client";

import {useEffect, useState} from "react";
import {Card, CardContent} from "@/components/ui/card";
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
import {Loader2, ClipboardList, ChevronDown, ChevronRight} from "lucide-react";

interface AuditLog {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: { before: Record<string, unknown> | null; after: Record<string, unknown> | null } | null;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  created_at: string;
}

function formatDetails(log: AuditLog): { summary: string; changes?: string[]; entityName?: string } {
  const details = log.details;
  if (!details) return { summary: "—" };

  const { before, after } = details;
  const afterData = (after || {}) as Record<string, unknown>;
  const beforeData = (before || {}) as Record<string, unknown>;

  // Extract entity name from details
  const entityName = 
    (afterData?.name as string) || 
    (afterData?.full_name as string) || 
    (afterData?.title as string) ||
    (beforeData?.name as string) || 
    (beforeData?.full_name as string) || 
    (beforeData?.title as string);

  // Internal fields to hide
  const hiddenFields = ['id', 'tenant_id', 'created_at', 'updated_at', 'password_hash', 'invite_token', 'invite_expires_at'];

  if (log.action === 'create' && after) {
    const keyFields = Object.entries(afterData)
      .filter(([key]) => !hiddenFields.includes(key))
      .slice(0, 3)
      .map(([key, val]) => {
        if (val === null || val === undefined) return null;
        const displayVal = typeof val === 'string' && val.length > 30 
          ? val.slice(0, 30) + '...' 
          : String(val);
        return `${key.replace(/_/g, ' ')}: ${displayVal}`;
      })
      .filter(Boolean);
    
    return { 
      summary: keyFields.length > 0 ? keyFields.join(', ') : 'Created', 
      entityName 
    };
  }

  if ((log.action === 'update' || log.action === 'status_change') && before && after) {
    const changes: string[] = [];
    Object.keys(afterData).forEach((key) => {
      if (hiddenFields.includes(key)) return;
      const beforeVal = beforeData[key];
      const afterVal = afterData[key];
      if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
        const displayBefore = beforeVal === null ? 'null' : String(beforeVal);
        const displayAfter = afterVal === null ? 'null' : String(afterVal);
        if (key.toLowerCase().includes('status')) {
          changes.push(`${key.replace(/_/g, ' ')}: ${displayBefore} → ${displayAfter}`);
        } else {
          changes.push(`${key.replace(/_/g, ' ')} changed`);
        }
      }
    });
    
    return { 
      summary: changes.length > 0 ? changes[0] : 'Updated', 
      changes: changes.slice(1),
      entityName
    };
  }

  if (log.action === 'delete' && before) {
    return { 
      summary: `Deleted: ${entityName || beforeData.id || 'Unknown'}`,
      entityName 
    };
  }

  return { summary: "—", entityName };
}

function getEntityDisplayName(log: AuditLog): string | null {
  const details = log.details;
  if (!details) return null;
  
  const afterData = (details.after || {}) as Record<string, unknown>;
  const beforeData = (details.before || {}) as Record<string, unknown>;
  
  return (afterData?.name as string) || 
         (afterData?.full_name as string) || 
         (afterData?.title as string) ||
         (beforeData?.name as string) || 
         (beforeData?.full_name as string) || 
         (beforeData?.title as string) ||
         null;
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
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

  function toggleExpand(id: string) {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  }

  const actionColors: Record<string, string> = {
    create: "bg-green-50 text-green-700 border-green-200",
    update: "bg-blue-50 text-blue-700 border-blue-200",
    delete: "bg-red-50 text-red-700 border-red-200",
    approve: "bg-purple-50 text-purple-700 border-purple-200",
    reject: "bg-orange-50 text-orange-700 border-orange-200",
    login: "bg-gray-50 text-gray-700 border-gray-200",
    invite: "bg-yellow-50 text-yellow-700 border-yellow-200",
    status_change: "bg-indigo-50 text-indigo-700 border-indigo-200",
  };

  const actionLabels: Record<string, string> = {
    create: "Created",
    update: "Updated",
    delete: "Deleted",
    status_change: "Status Changed",
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
                    <TableHead className="w-[140px]">Time</TableHead>
                    <TableHead className="w-[100px]">Action</TableHead>
                    <TableHead className="w-[200px]">Entity</TableHead>
                    <TableHead className="min-w-[250px]">Details</TableHead>
                    <TableHead className="w-[150px]">By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const { summary, changes } = formatDetails(log);
                    const entityName = getEntityDisplayName(log);
                    const hasMoreDetails = (changes && changes.length > 0) || 
                      (log.details && (log.details.before || log.details.after));
                    const isExpanded = expandedRows.has(log.id);
                    
                    return (
                      <TableRow key={log.id} className="group">
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap" suppressHydrationWarning>
                          {new Date(log.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs capitalize whitespace-nowrap ${actionColors[log.action] || ""}`}>
                            {actionLabels[log.action] || log.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className="capitalize text-muted-foreground">{log.entity_type.replace(/_/g, ' ')}</span>
                          {entityName ? (
                            <span className="text-foreground font-medium ml-1 block truncate max-w-[150px]" title={entityName}>
                              · {entityName}
                            </span>
                          ) : log.entity_id ? (
                            <span className="text-muted-foreground text-xs ml-1">
                              · {log.entity_id.slice(0, 8)}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex items-start gap-2">
                            <span className={hasMoreDetails ? "text-foreground" : "text-muted-foreground"}>
                              {summary}
                            </span>
                            {hasMoreDetails && (
                              <button
                                onClick={() => toggleExpand(log.id)}
                                className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted transition-colors"
                                title={isExpanded ? "Collapse details" : "Expand details"}
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </button>
                            )}
                          </div>
                          {isExpanded && log.details && (
                            <div className="mt-2 text-xs bg-muted p-3 rounded overflow-auto max-h-48">
                              {log.details.before && (
                                <div className="mb-2">
                                  <span className="text-muted-foreground font-medium">Before:</span>
                                  <pre className="mt-1 text-muted-foreground">
                                    {JSON.stringify(log.details.before, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {log.details.after && (
                                <div>
                                  <span className="text-muted-foreground font-medium">After:</span>
                                  <pre className="mt-1 text-muted-foreground">
                                    {JSON.stringify(log.details.after, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {log.user_name ? (
                            <div className="flex flex-col">
                              <span className="font-medium truncate max-w-[130px]" title={log.user_name}>
                                {log.user_name}
                              </span>
                              <span className="text-xs text-muted-foreground truncate max-w-[130px]">
                                {log.user_email}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">
                              {log.user_id?.slice(0, 8) || "—"}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
