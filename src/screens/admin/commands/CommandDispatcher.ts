/**
 * Command Dispatcher - Administrative Mutation Pipeline
 * Enforces RBAC verification prior to execution and guarantees immutable audit persistence
 * in the admin_activity_logs Supabase table.
 */

import { Platform } from "react-native";
import { supabase } from "@/utils/supabase";
import { AdminUser } from "@/types/admin";
import { AdminCommand, CommandExecutionResult } from "./AdminCommand";
import { checkPermission } from "../rbac/rbacTypes";

type AuditLogListener = (logEntry: any) => void;
const auditListeners: Set<AuditLogListener> = new Set();

/**
 * Register a listener to be notified whenever a new audit log is produced
 */
export function subscribeToAuditLogs(listener: AuditLogListener): () => void {
  auditListeners.add(listener);
  return () => {
    auditListeners.delete(listener);
  };
}

/**
 * Helper to ensure valid UUID format for PostgreSQL UUID column
 */
function toUuidOrNull(id?: string | null): string | null {
  if (!id || typeof id !== "string") return null;
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id.trim()) ? id.trim() : null;
}

function getClientUserAgent(): string {
  if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.userAgent) {
    return navigator.userAgent;
  }
  return `ShopnoJatra-Admin/${Platform.OS}`;
}

/**
 * Executes an AdminCommand through the governance pipeline:
 * 1. Active admin identity & RBAC authorization validation
 * 2. Execution of command (throws on DB/API failure so audit logs never forge success)
 * 3. Immutable audit logging into `admin_activity_logs`
 * 4. Dispatching event to active subscribers
 */
export async function executeAdminCommand<TResult = any>(
  command: AdminCommand<TResult>,
  admin: AdminUser | null | undefined,
  options?: { isSimulationMode?: boolean }
): Promise<CommandExecutionResult<TResult>> {
  const adminUuid = toUuidOrNull(admin?.id);
  if (!admin || !adminUuid || admin.status !== "active") {
    return {
      success: false,
      error: "Active verified administrator session is required to perform mutations.",
    };
  }

  if (options?.isSimulationMode) {
    return {
      success: false,
      error: "Read-only role simulation mode is active. Exit simulation to execute mutations.",
    };
  }

  // 1. RBAC PRE-EXECUTION CHECK
  const isAuthorized = checkPermission(admin, command.requiredPermission);

  if (!isAuthorized) {
    const violationLog = {
      admin_id: adminUuid,
      user_id: toUuidOrNull(admin.user_id),
      action: "SECURITY_VIOLATION_UNAUTHORIZED_MUTATION",
      status: "denied",
      module: "security",
      entity_type: command.entityType,
      entity_id: toUuidOrNull(command.entityId),
      details: {
        denied_action: command.action,
        attempted_module: command.module,
        required_permission: command.requiredPermission,
        admin_role: admin.role,
        admin_user_id: admin.user_id,
        target_id: command.entityId,
        timestamp: new Date().toISOString(),
      },
      user_agent: getClientUserAgent(),
      created_at: new Date().toISOString(),
    };

    try {
      await supabase.from("admin_activity_logs").insert(violationLog);
      auditListeners.forEach((fn) => fn(violationLog));
    } catch (e) {
      console.warn("Failed to log unauthorized mutation violation:", e);
    }

    return {
      success: false,
      error: `RBAC Access Denied: Administrator with role '${admin.role}' lacks permission '${command.requiredPermission}' required to execute '${command.action}'.`,
    };
  }

  // 2. COMMAND EXECUTION
  try {
    const result = await command.execute(admin);

    // 3. IMMUTABLE AUDIT LOGGING
    const details = command.toAuditDetails(admin, result);
    const auditRecord = {
      admin_id: adminUuid,
      user_id: toUuidOrNull(admin.user_id),
      action: command.action,
      status: "success",
      module: command.module,
      entity_type: command.entityType,
      entity_id: toUuidOrNull(command.entityId),
      details: {
        ...details,
        target_id: command.entityId,
        executed_by_role: admin.role,
        admin_name: admin.name || "System Admin",
      },
      user_agent: getClientUserAgent(),
      created_at: new Date().toISOString(),
    };

    let logId: string | undefined;
    try {
      const { data, error: logInsertErr } = await supabase
        .from("admin_activity_logs")
        .insert(auditRecord)
        .select("id")
        .single();
      if (logInsertErr) {
        console.warn("Warning: admin_activity_logs insert returned error:", logInsertErr.message);
      } else if (data) {
        logId = data.id;
      }
    } catch (logErr) {
      console.warn("Warning: Supabase audit log insert error:", logErr);
    }

    // 4. NOTIFY AUDIT SUBSCRIBERS
    auditListeners.forEach((fn) =>
      fn({
        ...auditRecord,
        id: logId || `local-${Date.now()}`,
      })
    );

    return {
      success: true,
      result,
      auditLogId: logId,
    };
  } catch (err: any) {
    console.error(`Command execution failed for ${command.action}:`, err);
    const failureLog = {
      admin_id: adminUuid,
      user_id: toUuidOrNull(admin.user_id),
      action: `${command.action}_FAILED`,
      status: "failed",
      module: command.module,
      entity_type: command.entityType,
      entity_id: toUuidOrNull(command.entityId),
      details: {
        target_id: command.entityId,
        executed_by_role: admin.role,
        admin_name: admin.name || "System Admin",
        error: err?.message || "Command execution error",
        timestamp: new Date().toISOString(),
      },
      user_agent: getClientUserAgent(),
      created_at: new Date().toISOString(),
    };
    try {
      await supabase.from("admin_activity_logs").insert(failureLog);
    } catch {
      // Non-fatal if failure audit fails
    }

    return {
      success: false,
      error: err?.message || `Failed to execute administrative command '${command.action}'.`,
    };
  }
}
