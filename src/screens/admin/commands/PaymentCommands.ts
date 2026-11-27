import { supabase } from "@/utils/supabase";
import { AdminUser } from "@/types/admin";
import { AdminCommand } from "./AdminCommand";
import { AdminPermission } from "../rbac/rbacTypes";

export class VerifyPaymentCommand implements AdminCommand<{ id: string; status: string }> {
  readonly id = `cmd-payment-verify-${Date.now()}`;
  readonly action = "PAYMENT_MANUAL_VERIFY";
  readonly module = "payments";
  readonly entityType = "booking_payments";
  readonly requiredPermission: AdminPermission = "payments.settle";

  constructor(
    readonly entityId: string,
    readonly notes: string = "Manual verification override by administrator"
  ) {}

  async execute(admin: AdminUser) {
    const timestamp = new Date().toISOString();

    const { error: bpErr } = await supabase
      .from("booking_payments")
      .update({
        payment_status: "completed",
        processed_at: timestamp,
      })
      .eq("id", this.entityId);

    if (bpErr) {
      throw new Error(bpErr.message || "Failed to verify booking payment.");
    }

    return { id: this.entityId, status: "completed" };
  }

  toAuditDetails(admin: AdminUser, result: any) {
    return {
      transaction_id: this.entityId,
      status: "completed",
      notes: this.notes,
      operator: admin.name || admin.user_id,
      timestamp: new Date().toISOString(),
    };
  }
}
