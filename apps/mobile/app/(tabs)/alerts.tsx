import { useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface AlertItem {
  id: string;
  category: "RISK" | "INTELLIGENCE" | "SYSTEM";
  severity: "CRITICAL" | "WARNING" | "INFO";
  title: string;
  description: string;
  recommendation: string;
  timestamp: string;
  status?: string;
}

const INITIAL_ALERTS: AlertItem[] = [
  {
    id: "alt_1",
    category: "RISK",
    severity: "WARNING",
    title: "ETH Funding Rate Overheat",
    description: "ETH 8h funding rate reached +0.082%. Long carry cost elevated.",
    recommendation: "Reduce ETH delta 20% or open inverse perp basis hedge.",
    timestamp: "2m ago",
  },
  {
    id: "alt_2",
    category: "INTELLIGENCE",
    severity: "INFO",
    title: "Market Regime Switch: High Volatility Expansion",
    description: "Differential factor engine flagged expansion in 15m implied variance.",
    recommendation: "Tighten slippage tolerance to 3 bps and expand maker spread.",
    timestamp: "8m ago",
  },
  {
    id: "alt_3",
    category: "SYSTEM",
    severity: "CRITICAL",
    title: "Deribit Gateway Latency Spike (>350ms)",
    description: "P99 order ACK latency exceeded SLA threshold. Deribit routed to passive-only.",
    recommendation: "Failover options routing to OKX or suspend maker quotes.",
    timestamp: "14m ago",
  },
];

export default function AlertsScreen() {
  const [alerts, setAlerts] = useState<AlertItem[]>(INITIAL_ALERTS);

  const handleAction = (id: string, actionText: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: `✓ ${actionText}` } : a))
    );
  };

  const dismissAlert = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerCard}>
        <View style={styles.rowBetween}>
          <Text style={styles.headerTitle}>ACTIONABLE ALERTS FEED</Text>
          <Text style={styles.activeCount}>{alerts.length} Pending</Text>
        </View>
        <Text style={styles.headerSub}>
          Spec §32: Direct 1-tap risk mitigations and intelligence-driven interventions.
        </Text>
      </View>

      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const isCritical = item.severity === "CRITICAL";
          const isWarning = item.severity === "WARNING";
          return (
            <View
              style={[
                styles.alertCard,
                isCritical && styles.alertCardCritical,
                isWarning && styles.alertCardWarning,
              ]}
            >
              {/* Category & Severity & Timestamp */}
              <View style={styles.rowBetween}>
                <View style={styles.badgeRow}>
                  <View
                    style={[
                      styles.severityBadge,
                      isCritical
                        ? styles.badgeCritical
                        : isWarning
                        ? styles.badgeWarning
                        : styles.badgeInfo,
                    ]}
                  >
                    <Text
                      style={[
                        styles.severityText,
                        isCritical
                          ? styles.redText
                          : isWarning
                          ? styles.yellowText
                          : styles.blueText,
                      ]}
                    >
                      {item.severity}
                    </Text>
                  </View>
                  <Text style={styles.categoryText}>{item.category}</Text>
                </View>
                <Text style={styles.timestampText}>{item.timestamp}</Text>
              </View>

              {/* Title & Description */}
              <Text style={styles.alertTitle}>{item.title}</Text>
              <Text style={styles.alertDesc}>{item.description}</Text>

              {/* Recommendation */}
              <View style={styles.recBox}>
                <Text style={styles.recLabel}>ACTION:</Text>
                <Text style={styles.recText}>{item.recommendation}</Text>
              </View>

              {/* Interactive Status or 1-tap Actions */}
              {item.status ? (
                <View style={styles.statusBox}>
                  <Text style={styles.greenText}>{item.status}</Text>
                </View>
              ) : (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.btnExecute]}
                    onPress={() => handleAction(item.id, "Executed recommended mitigation")}
                  >
                    <Text style={styles.btnTextDark}>Execute</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.btnDismiss]}
                    onPress={() => dismissAlert(item.id)}
                  >
                    <Text style={styles.btnTextLight}>Dismiss</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#080b10",
    padding: 14,
  },
  headerCard: {
    backgroundColor: "#0e131b",
    borderWidth: 1,
    borderColor: "#1e2633",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: {
    color: "#f3f4f6",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  activeCount: {
    color: "#f59e0b",
    fontSize: 11,
    fontWeight: "700",
  },
  headerSub: {
    color: "#6b7280",
    fontSize: 11,
    marginTop: 4,
  },
  alertCard: {
    backgroundColor: "#0e131b",
    borderWidth: 1,
    borderColor: "#1e2633",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  alertCardCritical: {
    borderColor: "rgba(239, 68, 68, 0.4)",
    backgroundColor: "rgba(239, 68, 68, 0.05)",
  },
  alertCardWarning: {
    borderColor: "rgba(245, 158, 11, 0.4)",
    backgroundColor: "rgba(245, 158, 11, 0.05)",
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  severityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeCritical: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
  },
  badgeWarning: {
    backgroundColor: "rgba(245, 158, 11, 0.2)",
  },
  badgeInfo: {
    backgroundColor: "rgba(59, 130, 246, 0.2)",
  },
  severityText: {
    fontSize: 9,
    fontWeight: "800",
  },
  categoryText: {
    color: "#6b7280",
    fontSize: 10,
    fontWeight: "600",
  },
  timestampText: {
    color: "#6b7280",
    fontSize: 10,
  },
  alertTitle: {
    color: "#f3f4f6",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 6,
  },
  alertDesc: {
    color: "#9ca3af",
    fontSize: 12,
    marginTop: 4,
  },
  recBox: {
    flexDirection: "row",
    gap: 6,
    backgroundColor: "#080b10",
    padding: 8,
    borderRadius: 6,
    marginTop: 8,
  },
  recLabel: {
    color: "#f59e0b",
    fontSize: 11,
    fontWeight: "800",
  },
  recText: {
    color: "#e6edf3",
    fontSize: 11,
    flex: 1,
    fontWeight: "600",
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: "center",
  },
  btnExecute: {
    backgroundColor: "#10b981",
  },
  btnDismiss: {
    backgroundColor: "#1f2937",
    borderWidth: 1,
    borderColor: "#374151",
  },
  btnTextDark: {
    color: "#080b10",
    fontSize: 12,
    fontWeight: "800",
  },
  btnTextLight: {
    color: "#f3f4f6",
    fontSize: 12,
    fontWeight: "600",
  },
  statusBox: {
    marginTop: 8,
    paddingVertical: 6,
  },
  greenText: {
    color: "#10b981",
    fontWeight: "700",
    fontSize: 12,
  },
  yellowText: {
    color: "#f59e0b",
  },
  redText: {
    color: "#ef4444",
  },
  blueText: {
    color: "#3b82f6",
  },
});
