import { supabase } from "@/utils/supabase";
import { AdminUser, AgencyVerificationStatus } from "@/types/admin";
import { AdminCommand } from "./AdminCommand";
import { AdminPermission } from "../rbac/rbacTypes";

async function upsertAgencyAdminDetails(agencyId: string, payload: Record<string, any>) {
  const { data: existing } = await supabase
    .from("agency_admin_details")
    .select("id")
    .eq("agency_id", agencyId)
    .maybeSingle();

  const res = existing
    ? await supabase.from("agency_admin_details").update(payload).eq("agency_id", agencyId)
    : await supabase.from("agency_admin_details").insert({ agency_id: agencyId, ...payload });

  if (res.error) {
    throw new Error(res.error.message || "Failed to persist agency_admin_details.");
  }
}

export class VerifyAgencyCommand implements AdminCommand<{ id: string; status: string }> {
  readonly id = `cmd-agency-verify-${Date.now()}`;
  readonly action = "AGENCY_VERIFY";
  readonly module = "agencies";
  readonly entityType = "travel_agency";
  readonly requiredPermission: AdminPermission = "agencies.verify";

  constructor(
    readonly entityId: string,
    readonly notes: string = ""
  ) {}

  async execute(admin: AdminUser) {
    const timestamp = new Date().toISOString();
    const { error: agencyErr } = await supabase
      .from("agencies")
      .update({
        is_verified: true,
        verification_status: "verified",
        status: "active",
        verified_at: timestamp,
        verified_by: admin.user_id,
        updated_at: timestamp,
      })
      .eq("id", this.entityId);

    if (agencyErr) {
      throw new Error(agencyErr.message || "Failed to verify agency.");
    }

    await upsertAgencyAdminDetails(this.entityId, {
      verification_status: AgencyVerificationStatus.VERIFIED,
      is_certified: true,
      is_suspended: false,
      verified_by: admin.id,
      verified_at: timestamp,
      updated_at: timestamp,
    });

    return { id: this.entityId, status: "Verified" };
  }

  toAuditDetails(admin: AdminUser, result: any) {
    return {
      agency_id: this.entityId,
      status: "Verified",
      notes: this.notes,
      operator: admin.name || admin.user_id,
      timestamp: new Date().toISOString(),
    };
  }
}

export class SuspendAgencyCommand implements AdminCommand<{ id: string; status: string }> {
  readonly id = `cmd-agency-suspend-${Date.now()}`;
  readonly action = "AGENCY_SUSPEND";
  readonly module = "agencies";
  readonly entityType = "travel_agency";
  readonly requiredPermission: AdminPermission = "agencies.suspend";

  constructor(
    readonly entityId: string,
    readonly reason: string
  ) {}

  async execute(admin: AdminUser) {
    const timestamp = new Date().toISOString();
    const { error: agencyErr } = await supabase
      .from("agencies")
      .update({
        is_verified: false,
        status: "suspended",
        updated_at: timestamp,
      })
      .eq("id", this.entityId);

    if (agencyErr) {
      throw new Error(agencyErr.message || "Failed to suspend agency.");
    }

    await upsertAgencyAdminDetails(this.entityId, {
      is_suspended: true,
      suspension_reason: this.reason,
      suspension_date: timestamp,
      updated_at: timestamp,
    });

    return { id: this.entityId, status: "Suspended" };
  }

  toAuditDetails(admin: AdminUser, result: any) {
    return {
      agency_id: this.entityId,
      status: "Suspended",
      suspension_reason: this.reason,
      operator: admin.name || admin.user_id,
      timestamp: new Date().toISOString(),
    };
  }
}

export class ReactivateAgencyCommand implements AdminCommand<{ id: string; status: string }> {
  readonly id = `cmd-agency-reactivate-${Date.now()}`;
  readonly action = "AGENCY_REACTIVATE";
  readonly module = "agencies";
  readonly entityType = "travel_agency";
  readonly requiredPermission: AdminPermission = "agencies.reactivate";

  constructor(
    readonly entityId: string,
    readonly notes: string = ""
  ) {}

  async execute(admin: AdminUser) {
    const timestamp = new Date().toISOString();
    const { error: agencyErr } = await supabase
      .from("agencies")
      .update({
        is_verified: true,
        status: "active",
        updated_at: timestamp,
      })
      .eq("id", this.entityId);

    if (agencyErr) {
      throw new Error(agencyErr.message || "Failed to reactivate agency.");
    }

    await upsertAgencyAdminDetails(this.entityId, {
      is_suspended: false,
      verification_status: AgencyVerificationStatus.REACTIVATED,
      reactivation_date: timestamp,
      updated_at: timestamp,
    });

    return { id: this.entityId, status: "Verified" };
  }

  toAuditDetails(admin: AdminUser, result: any) {
    return {
      agency_id: this.entityId,
      status: "Reactivated",
      notes: this.notes,
      operator: admin.name || admin.user_id,
      timestamp: new Date().toISOString(),
    };
  }
}
