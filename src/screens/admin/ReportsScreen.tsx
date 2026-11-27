/**
 * Reports & Analytics Screen - Admin Panel
 * Generate and view financial reports, business metrics, and analytics
 */

import React, { useState, useEffect } from "react";
import {
  View,
  ScrollView,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  ActivityIndicator,
  Alert,
  Dimensions,
  RefreshControl,
  Animated,
  Platform,
  Share,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Svg, { Path, Circle } from "react-native-svg";
import { reportService, adminService } from "@/services/adminService";
import { supabase } from "@/utils/supabase";
import { FinancialReport, AdminUser } from "@/types/admin";
import { showLocalizedAlert } from "../../utils/localizedAlert";
import { exportCsvOrTextFile } from "../../utils/webExport";

import { useResponsive } from "../../hooks/useResponsive";

/**
 * Report Card Component
 */
const ReportCard: React.FC<{
  title: string;
  value: string | number;
  unit?: string;
  trend?: number;
  icon: string;
  gradient: [string, string];
  onPress?: () => void;
}> = ({ title, value, unit, trend, icon, gradient, onPress }) => {
  return (
    <TouchableOpacity onPress={onPress}>
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.reportCard}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardIcon}>
            <MaterialCommunityIcons name={icon as any} size={24} color="#fff" />
          </View>
          {trend !== undefined && (
            <View
              style={[
                styles.trendBadge,
                { backgroundColor: trend >= 0 ? "#d1fae5" : "#fee2e2" },
              ]}
            >
              <MaterialCommunityIcons
                name={trend >= 0 ? "trending-up" : "trending-down"}
                size={14}
                color={trend >= 0 ? "#059669" : "#dc2626"}
              />
              <Text style={{ color: trend >= 0 ? "#059669" : "#dc2626" }}>
                {Math.abs(trend)}%
              </Text>
            </View>
          )}
        </View>

        <View style={styles.cardContent}>
          <Text style={styles.cardTitle}>{title}</Text>
          <View style={styles.valueRow}>
            <Text style={styles.cardValue}>{value}</Text>
            {unit && <Text style={styles.unitText}>{unit}</Text>}
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
};

/**
 * Chart Component
 */
const SimpleChart: React.FC<{
  title: string;
  data: { label: string; value: number }[];
}> = ({ title, data }) => {
  const { width, isDesktop } = useResponsive();
  const [measuredWidth, setMeasuredWidth] = useState<number>(0);
  const chartWidth = measuredWidth > 0 ? measuredWidth : Math.max(280, (isDesktop ? width - 320 : width) - 64);
  const chartHeight = 200;
  const padding = 20;
  const graphWidth = Math.max(120, chartWidth - 2 * padding);
  const graphHeight = chartHeight - 2 * padding;

  if (!data || data.length === 0) {
    return (
      <View style={styles.chartContainer}>
        <Text style={styles.chartTitle}>{title}</Text>
        <Text style={{ color: "#64748b", fontSize: 13, paddingVertical: 32, textAlign: "center" }}>
          No report periods recorded yet.
        </Text>
      </View>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value), 1);

  const points = data.map((d, i) => ({
    x: padding + (data.length === 1 ? graphWidth / 2 : (i / (data.length - 1)) * graphWidth),
    y: chartHeight - padding - (d.value / maxValue) * graphHeight,
    label: d.label,
  }));

  const pathData = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  return (
    <LinearGradient
      colors={["#f5f7fa", "#ffffff"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={styles.chartContainer}
      onLayout={(e) => {
        const w = Math.floor(e.nativeEvent.layout.width - 32);
        if (w > 120 && Math.abs(w - measuredWidth) > 4) setMeasuredWidth(w);
      }}
    >
      <Text style={styles.chartTitle}>{title}</Text>
      <Svg width={chartWidth} height={chartHeight}>
        {/* Grid lines */}
        {[0, 1, 2, 3, 4].map((i) => (
          <React.Fragment key={`grid-${i}`}>
            <Path
              d={`M ${padding} ${padding + (i / 4) * graphHeight} L ${
                chartWidth - padding
              } ${padding + (i / 4) * graphHeight}`}
              stroke="#e5e7eb"
              strokeWidth="1"
              strokeDasharray="5,5"
            />
          </React.Fragment>
        ))}

        {/* Chart line */}
        <Path
          d={pathData}
          stroke="url(#chartGradient)"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {points.map((p, i) => (
          <Circle
            key={`point-${i}`}
            cx={p.x}
            cy={p.y}
            r="4"
            fill="#667eea"
            opacity="1"
          />
        ))}

        {/* Axes */}
        <Path
          d={`M ${padding} ${chartHeight - padding} L ${chartWidth - padding} ${
            chartHeight - padding
          }`}
          stroke="#d1d5db"
          strokeWidth="2"
        />
        <Path
          d={`M ${padding} ${padding} L ${padding} ${chartHeight - padding}`}
          stroke="#d1d5db"
          strokeWidth="2"
        />
      </Svg>
    </LinearGradient>
  );
};

/**
 * Financial Report Card
 */
const FinancialReportCard: React.FC<{
  report: FinancialReport;
  onPress: (report: FinancialReport) => void;
  onDownload?: (report: FinancialReport) => void;
  onShare?: (report: FinancialReport) => void;
}> = ({ report, onPress, onDownload, onShare }) => {
  return (
    <TouchableOpacity onPress={() => onPress(report)}>
      <LinearGradient
        colors={["#ffffff", "#f9fafb"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.financialReportCard}
      >
        <View style={styles.reportHeader}>
          <View>
            <Text style={styles.reportTitle}>
              {new Date(report.report_date || report.created_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
              })}
            </Text>
            <Text style={styles.reportSubtitle}>Financial Statement</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: "#d1fae5" }]}>
            <Text style={[styles.statusText, { color: "#059669" }]}>
              {report.report_type.toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.reportMetrics}>
          <View style={styles.metricRow}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Revenue</Text>
              <Text style={styles.metricValue}>
                ৳ {Number(report.total_revenue || 0).toLocaleString()}
              </Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Expenses</Text>
              <Text style={[styles.metricValue, { color: "#ef4444" }]}>
                ৳ {Number(report.total_expenses || 0).toLocaleString()}
              </Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Net Margin</Text>
              <Text style={[styles.metricValue, { color: "#10b981" }]}>
                ৳ {((report.total_revenue || 0) - (report.total_expenses || 0)).toLocaleString()}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.reportFooter}>
          <TouchableOpacity style={styles.actionButton} onPress={() => onPress(report)}>
            <Ionicons name="eye-outline" size={14} color="#667eea" />
            <Text style={styles.actionButtonText}>View Details</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => onDownload?.(report)}>
            <MaterialCommunityIcons name="download" size={14} color="#667eea" />
            <Text style={styles.actionButtonText}>Export CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={() => onShare?.(report)}>
            <MaterialCommunityIcons
              name="share-variant"
              size={14}
              color="#667eea"
            />
            <Text style={styles.actionButtonText}>Share</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
};

/**
 * Reports & Analytics Screen
 */
export const ReportsScreen: React.FC<{ admin: AdminUser | null }> = ({
  admin,
}) => {
  const [reports, setReports] = useState<FinancialReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedReport, setSelectedReport] = useState<FinancialReport | null>(
    null,
  );

  const [liveKpis, setLiveKpis] = useState({
    totalBookings: 0,
    activeUsers: 0,
    conversionRate: 0,
  });

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    setLoading(true);
    try {
      const endDate = new Date().toISOString();
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days ago
      const [allReports, bookingsRes, usersRes] = await Promise.all([
        reportService.getFinancialReports("revenue", startDate, endDate),
        supabase.from("bookings").select("status", { count: "exact" }),
        supabase.from("community_profiles").select("*", { count: "exact", head: true }),
      ]);
      setReports(allReports);

      const bookingRows = bookingsRes.data || [];
      const totalBookings = bookingsRes.count ?? bookingRows.length;
      const completedCount = bookingRows.filter(
        (b: any) => b.status === "completed" || b.status === "confirmed"
      ).length;
      const activeUsers = usersRes.count ?? 0;
      const conversionRate =
        totalBookings > 0 ? Math.round((completedCount / totalBookings) * 1000) / 10 : 0;

      setLiveKpis({
        totalBookings,
        activeUsers,
        conversionRate,
      });
    } catch (error) {
      console.error("Error loading reports:", error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReports();
    setRefreshing(false);
  };

  // Dynamic data for charts computed from real loaded reports
  const revenueData = reports.length > 0
    ? reports.slice(0, 6).map((r) => ({
        label: r.report_period_start ? new Date(r.report_period_start).toLocaleDateString("en-US", { month: "short" }) : "Period",
        value: Math.round(Number(r.total_revenue) / 1000) || 0,
      }))
    : [];

  // Derived aggregated metrics in BDT
  const totalRevenueBDT = reports.reduce(
    (sum, r) => sum + (Number(r.total_revenue) || 0),
    0
  );
  const totalExpensesBDT = reports.reduce(
    (sum, r) => sum + (Number(r.total_expenses) || 0),
    0
  );

  const handleExportCsv = async () => {
    if (reports.length === 0) {
      showLocalizedAlert("Notice", "No reports available to export.");
      return;
    }
    const headers = "Report ID,Report Date,Period Start,Period End,Type,Revenue (BDT),Expenses (BDT),Profit (BDT)\n";
    const rows = reports
      .map(
        (r) =>
          `"${r.id}","${r.report_date || ""}","${r.report_period_start || ""}","${r.report_period_end || ""}","${r.report_type}",${r.total_revenue || 0},${r.total_expenses || 0},${(r.total_revenue || 0) - (r.total_expenses || 0)}`
      )
      .join("\n");
    const csvContent = headers + rows;

    try {
      await exportCsvOrTextFile({
        filename: `shopnojatra_financial_reports_${new Date().toISOString().slice(0, 10)}.csv`,
        content: csvContent,
        title: "ShopnoJatra Financial Report CSV",
      });
      showLocalizedAlert("Export Successful", "Financial CSV exported successfully.");
    } catch (err: any) {
      showLocalizedAlert("Export Error", err?.message || `Failed to export ${reports.length} records.`);
    }
  };

  const handleExportPdf = () => {
    showLocalizedAlert(
      "Financial PDF Export",
      `ShopnoJatra Consolidated Statement\nPeriod: Last 30 Days\nTotal Revenue: ৳ ${totalRevenueBDT.toLocaleString()}\nTotal Operating Expenses: ৳ ${totalExpensesBDT.toLocaleString()}\nNet Operating Margin: ৳ ${(totalRevenueBDT - totalExpensesBDT).toLocaleString()}\n\nStatement formatted for executive audit print.`
    );
  };

  const handleDownloadSingleReport = async (report: FinancialReport) => {
    const content = `Report ID: ${report.id}\nType: ${report.report_type}\nRevenue: ৳ ${report.total_revenue}\nExpenses: ৳ ${report.total_expenses}\nNet: ৳ ${(report.total_revenue || 0) - (report.total_expenses || 0)}`;
    try {
      await exportCsvOrTextFile({
        filename: `report_${report.id.slice(0, 8)}.txt`,
        content,
        mimeType: "text/plain;charset=utf-8;",
        title: `Report ${report.id}`,
      });
    } catch (err: any) {
      showLocalizedAlert("Export Error", err?.message || "Failed to download report.");
    }
  };

  const handleShareSingleReport = (report: FinancialReport) => {
    Share.share({
      message: `ShopnoJatra Financial Statement (${report.report_type.toUpperCase()}):\nRevenue: ৳ ${Number(report.total_revenue || 0).toLocaleString()}\nExpenses: ৳ ${Number(report.total_expenses || 0).toLocaleString()}\nProfit: ৳ ${((report.total_revenue || 0) - (report.total_expenses || 0)).toLocaleString()}`,
      title: "Share Financial Report",
    });
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#3b82f6", "#2563eb"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>Reports & Analytics</Text>
        <Text style={styles.headerSubtitle}>
          Financial metrics, revenue audits and business insights
        </Text>
      </LinearGradient>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={styles.scrollContent}
        >
          {/* Key Metrics */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Key Financial Metrics</Text>
            <View style={styles.metricsGrid}>
              <ReportCard
                title="Gross Revenue"
                value={`৳ ${totalRevenueBDT.toLocaleString()}`}
                icon="cash"
                gradient={["#10b981", "#059669"]}
              />
              <ReportCard
                title="Total Bookings"
                value={liveKpis.totalBookings.toLocaleString()}
                icon="calendar-check"
                gradient={["#06b6d4", "#0891b2"]}
              />
            </View>

            <View style={styles.metricsGrid}>
              <ReportCard
                title="Active Users"
                value={liveKpis.activeUsers.toLocaleString()}
                icon="users"
                gradient={["#667eea", "#764ba2"]}
              />
              <ReportCard
                title="Conversion Rate"
                value={liveKpis.conversionRate.toFixed(1)}
                unit="%"
                icon="trending-up"
                gradient={["#f59e0b", "#f97316"]}
              />
            </View>
          </View>

          {/* Revenue Chart */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Revenue Trend (in k BDT)</Text>
            <SimpleChart title="Monthly Revenue Velocity" data={revenueData} />
          </View>

          {/* Reports List */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Financial Reports</Text>
            {reports.length > 0 ? (
              <View>
                {reports.map((report) => (
                  <FinancialReportCard
                    key={report.id}
                    report={report}
                    onPress={(r) => setSelectedReport(r)}
                    onDownload={handleDownloadSingleReport}
                    onShare={handleShareSingleReport}
                  />
                ))}
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <MaterialCommunityIcons
                  name="file-document"
                  size={64}
                  color="#d1d5db"
                />
                <Text style={styles.emptyText}>
                  No financial reports available
                </Text>
              </View>
            )}
          </View>

          {/* Export Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Export Reports</Text>
            <View style={styles.exportGrid}>
              <TouchableOpacity style={styles.exportButton} onPress={handleExportCsv}>
                <LinearGradient
                  colors={["#667eea", "#764ba2"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.exportButtonGradient}
                >
                  <MaterialCommunityIcons
                    name="file-excel"
                    size={24}
                    color="#fff"
                  />
                  <Text style={styles.exportButtonText}>Export CSV / Excel</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity style={styles.exportButton} onPress={handleExportPdf}>
                <LinearGradient
                  colors={["#ef4444", "#dc2626"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.exportButtonGradient}
                >
                  <MaterialCommunityIcons
                    name="file-pdf-box"
                    size={24}
                    color="#fff"
                  />
                  <Text style={styles.exportButtonText}>Export to PDF</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ height: 30 }} />
        </ScrollView>
      )}

      {/* Report Details Modal */}
      <Modal
        visible={!!selectedReport}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedReport(null)}
      >
        <View style={modalStyles.backdrop}>
          <View style={modalStyles.content}>
            <View style={modalStyles.header}>
              <Text style={modalStyles.title}>Financial Report Details</Text>
              <TouchableOpacity onPress={() => setSelectedReport(null)}>
                <Ionicons name="close" size={24} color="#374151" />
              </TouchableOpacity>
            </View>

            {selectedReport && (
              <ScrollView style={{ maxHeight: 360 }}>
                <View style={modalStyles.row}>
                  <Text style={modalStyles.label}>Report ID</Text>
                  <Text style={modalStyles.value}>{selectedReport.id}</Text>
                </View>
                <View style={modalStyles.row}>
                  <Text style={modalStyles.label}>Report Type</Text>
                  <Text style={modalStyles.value}>{selectedReport.report_type.toUpperCase()}</Text>
                </View>
                <View style={modalStyles.row}>
                  <Text style={modalStyles.label}>Period Start</Text>
                  <Text style={modalStyles.value}>{selectedReport.report_period_start || "N/A"}</Text>
                </View>
                <View style={modalStyles.row}>
                  <Text style={modalStyles.label}>Period End</Text>
                  <Text style={modalStyles.value}>{selectedReport.report_period_end || "N/A"}</Text>
                </View>
                <View style={modalStyles.divider} />
                <View style={modalStyles.row}>
                  <Text style={modalStyles.label}>Gross Revenue</Text>
                  <Text style={[modalStyles.value, { color: "#059669", fontWeight: "700" }]}>
                    ৳ {Number(selectedReport.total_revenue || 0).toLocaleString()}
                  </Text>
                </View>
                <View style={modalStyles.row}>
                  <Text style={modalStyles.label}>Operating Expenses</Text>
                  <Text style={[modalStyles.value, { color: "#dc2626", fontWeight: "700" }]}>
                    ৳ {Number(selectedReport.total_expenses || 0).toLocaleString()}
                  </Text>
                </View>
                <View style={modalStyles.row}>
                  <Text style={modalStyles.label}>Net Operating Margin</Text>
                  <Text style={[modalStyles.value, { color: "#2563eb", fontWeight: "700" }]}>
                    ৳ {((selectedReport.total_revenue || 0) - (selectedReport.total_expenses || 0)).toLocaleString()}
                  </Text>
                </View>
              </ScrollView>
            )}

            <TouchableOpacity
              style={modalStyles.closeButton}
              onPress={() => setSelectedReport(null)}
            >
              <Text style={modalStyles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f3f4f6",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#ffffff80",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    paddingHorizontal: 15,
    paddingTop: 20,
    paddingBottom: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1f2937",
    marginBottom: 12,
  },
  metricsGrid: {
    flexDirection: "row",
    gap: 12,
  },
  reportCard: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  cardIcon: {
    justifyContent: "center",
    alignItems: "center",
  },
  trendBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  cardContent: {
    gap: 8,
  },
  cardTitle: {
    fontSize: 13,
    color: "#ffffff80",
    fontWeight: "500",
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  cardValue: {
    fontSize: 24,
    fontWeight: "600",
    color: "#fff",
  },
  unitText: {
    fontSize: 12,
    color: "#ffffff80",
    fontWeight: "600",
  },
  chartContainer: {
    borderRadius: 12,
    padding: 16,
    overflow: "hidden",
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1f2937",
    marginBottom: 12,
  },
  financialReportCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    overflow: "hidden",
  },
  reportHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  reportTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1f2937",
    marginBottom: 4,
  },
  reportSubtitle: {
    fontSize: 12,
    color: "#6b7280",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  reportMetrics: {
    marginBottom: 12,
  },
  metricRow: {
    flexDirection: "row",
    gap: 12,
  },
  metricItem: {
    flex: 1,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  metricLabel: {
    fontSize: 12,
    color: "#9ca3af",
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#1f2937",
  },
  reportFooter: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 6,
    gap: 4,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#667eea",
  },
  exportGrid: {
    flexDirection: "row",
    gap: 12,
  },
  exportButton: {
    flex: 1,
  },
  exportButtonGradient: {
    paddingVertical: 16,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  exportButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "500",
  },
  emptyContainer: {
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: "#9ca3af",
    marginTop: 12,
  },
});

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  content: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 520,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  label: {
    fontSize: 14,
    color: "#6b7280",
  },
  value: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "500",
  },
  divider: {
    height: 1,
    backgroundColor: "#e5e7eb",
    marginVertical: 12,
  },
  closeButton: {
    marginTop: 20,
    backgroundColor: "#3b82f6",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  closeButtonText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 14,
  },
});

export default ReportsScreen;
