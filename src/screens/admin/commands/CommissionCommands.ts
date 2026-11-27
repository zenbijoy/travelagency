import { supabase } from "@/utils/supabase";
import { AdminUser } from "@/types/admin";
import { AdminCommand } from "./AdminCommand";
import { AdminPermission } from "../rbac/rbacTypes";

export class UpdateCommissionSplitCommand implements AdminCommand<{ splits: Record<string, string> }> {
  readonly id = `cmd-comm-split-${Date.now()}`;
  readonly action = "COMMISSION_SPLIT_UPDATE";
  readonly module = "commissions";
  readonly entityType = "system_commission";
  readonly entityId = "00000000-0000-0000-0000-000000000001";
  readonly requiredPermission: AdminPermission = "commissions.update";

  constructor(
    readonly splits: Record<string, string>,
    readonly notes: string = "Global commission matrix revision"
  ) {}

  async execute(admin: AdminUser) {
    const { error } = await supabase
      .from("system_settings")
      .upsert(
        {
          setting_key: "commission_splits",
          setting_value: JSON.stringify(this.splits),
          setting_type: "json",
          updated_by: admin.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "setting_key" }
      );

    if (error) {
      throw new Error(error.message || "Failed to persist commission splits.");
    }

    return { splits: this.splits };
  }

  toAuditDetails(admin: AdminUser, result: any) {
    return {
      updated_splits: this.splits,
      notes: this.notes,
      operator: admin.name || admin.user_id,
      timestamp: new Date().toISOString(),
    };
  }
}

export class ApprovePartnerPayoutCommand implements AdminCommand<{ payoutId: string; status: string }> {
  readonly id = `cmd-payout-${Date.now()}`;
  readonly action = "PARTNER_PAYOUT_APPROVE";
  readonly module = "commissions";
  readonly entityType = "agency_payout";
  readonly requiredPermission: AdminPermission = "commissions.payout";

  constructor(
    readonly entityId: string,
    readonly amount: string,
    readonly agencyName: string
  ) {}

  async execute(admin: AdminUser) {
    const { error } = await supabase
      .from("payouts")
      .update({
        status: "approved",
      })
      .eq("id", this.entityId)
      .eq("status", "draft");
    if (error) {
      throw new Error(error.message || "Failed to approve partner payout.");
    }
    return { payoutId: this.entityId, status: "approved" };
  }

  toAuditDetails(admin: AdminUser, result: any) {
    return {
      payout_id: this.entityId,
      agency_name: this.agencyName,
      settlement_amount: this.amount,
      status: "Approved for disbursement",
      operator: admin.name || admin.user_id,
      timestamp: new Date().toISOString(),
    };
  }
}
