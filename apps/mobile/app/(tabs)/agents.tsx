import { useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { formatAmount, formatCurrency, formatPct } from "@sisera/ui";

interface Agent {
  id: string;
  name: string;
  strategy: string;
  mode: "POLICY_AUTO" | "HUMAN_APPROVAL" | "DRY_RUN";
  status: "ACTIVE" | "PAUSED" | "STOPPED";
  pnl24h: number;
  winRate: number;
  maxDrawdown: number;
  openExposure: string;
}

const INITIAL_AGENTS: Agent[] = [
  {
    id: "alpha_momentum_1",
    name: "BTC Trend Follower v2",
    strategy: "Multi-Timeframe Momentum + SOR",
    mode: "POLICY_AUTO",
    status: "ACTIVE",
    pnl24h: 1240.5,
    winRate: 68.4,
    maxDrawdown: 3.2,
    openExposure: "$47,560",
  },
  {
    id: "stat_arb_scanner",
    name: "Cross-DEX Perp Basis Arb",
    strategy: "Statistical Arbitrage / Funding Basis",
    mode: "POLICY_AUTO",
    status: "ACTIVE",
    pnl24h: 382.1,
    winRate: 84.1,
    maxDrawdown: 1.1,
    openExposure: "$22,100",
  },
  {
    id: "macro_sentiment_hedger",
    name: "Macro Event Volatility Hedger",
    strategy: "Options & Prediction Hedging",
    mode: "HUMAN_APPROVAL",
    status: "PAUSED",
    pnl24h: -110.0,
    winRate: 52.0,
    maxDrawdown: 2.8,
    openExposure: "$0",
  },
];

export default function AgentsScreen() {
  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS);

  const togglePause = (id: string) => {
    setAgents((prev) =>
      prev.map((a) => {
        if (a.id === id) {
          const nextStatus = a.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
          return { ...a, status: nextStatus };
        }
        return a;
      })
    );
  };

  const killAgent = (id: string) => {
    setAgents((prev) =>
      prev.map((a) => {
        if (a.id === id) {
          return { ...a, status: "STOPPED", openExposure: "$0" };
        }
        return a;
      })
    );
  };

  return (
    <View style={styles.container}>
      {/* Header Info */}
      <View style={styles.headerCard}>
        <View style={styles.rowBetween}>
          <Text style={styles.headerTitle}>AUTONOMOUS AGENTS STUDIO</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>DETERMINISTIC GUARDRAILS</Text>
          </View>
        </View>
        <Text style={styles.headerSub}>
          Spec §52: All execution strictly bounded by policy engine and pre-trade risk checks.
        </Text>
      </View>

      <FlatList
        data={agents}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const isProfit = item.pnl24h >= 0;
          const isActive = item.status === "ACTIVE";
          return (
            <View style={styles.agentCard}>
              {/* Card Header */}
              <View style={styles.rowBetween}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.agentName}>{item.name}</Text>
                  <Text style={styles.strategyText}>{item.strategy}</Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    item.status === "ACTIVE"
                      ? styles.statusActive
                      : item.status === "PAUSED"
                      ? styles.statusPaused
                      : styles.statusStopped,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusBadgeText,
                      item.status === "ACTIVE"
                        ? styles.greenText
                        : item.status === "PAUSED"
                        ? styles.yellowText
                        : styles.redText,
                    ]}
                  >
                    ● {item.status}
                  </Text>
                </View>
              </View>

              {/* Mode & Policy */}
              <View style={styles.modeRow}>
                <Text style={styles.modeTag}>Mode: {item.mode}</Text>
                <Text style={styles.exposureTag}>Exposure: {item.openExposure}</Text>
              </View>

              {/* Metrics Grid */}
              <View style={styles.metricsGrid}>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>24h PnL</Text>
                  <Text style={[styles.metricVal, isProfit ? styles.greenText : styles.redText]}>
                    {isProfit ? "+" : ""}${formatAmount(item.pnl24h)}
                  </Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Win Rate</Text>
                  <Text style={styles.metricVal}>{item.winRate.toFixed(1)}%</Text>
                </View>
                <View style={styles.metricItem}>
                  <Text style={styles.metricLabel}>Max DD</Text>
                  <Text style={styles.metricVal}>{item.maxDrawdown.toFixed(1)}%</Text>
                </View>
              </View>

              {/* Controls */}
              <View style={styles.actionRow}>
                {item.status !== "STOPPED" && (
                  <TouchableOpacity
                    style={[styles.btn, isActive ? styles.btnPause : styles.btnResume]}
                    onPress={() => togglePause(item.id)}
                  >
                    <Text style={styles.btnTextLight}>
                      {isActive ? "Pause Agent" : "Resume Agent"}
                    </Text>
                  </TouchableOpacity>
                )}
                {item.status !== "STOPPED" && (
                  <TouchableOpacity
                    style={[styles.btn, styles.btnKill]}
                    onPress={() => killAgent(item.id)}
                  >
                    <Text style={styles.btnTextLight}>Kill / Liquidate</Text>
                  </TouchableOpacity>
                )}
                {item.status === "STOPPED" && (
                  <View style={styles.killedBox}>
                    <Text style={styles.redText}>Agent terminated & inventory neutral</Text>
                  </View>
                )}
              </View>
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
  badge: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    color: "#10b981",
    fontSize: 9,
    fontWeight: "700",
  },
  headerSub: {
    color: "#6b7280",
    fontSize: 11,
    marginTop: 4,
  },
  agentCard: {
    backgroundColor: "#0e131b",
    borderWidth: 1,
    borderColor: "#1e2633",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  agentName: {
    color: "#f3f4f6",
    fontSize: 14,
    fontWeight: "700",
  },
  strategyText: {
    color: "#9ca3af",
    fontSize: 11,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  statusActive: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
  },
  statusPaused: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
  },
  statusStopped: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  greenText: {
    color: "#10b981",
  },
  yellowText: {
    color: "#f59e0b",
  },
  redText: {
    color: "#ef4444",
  },
  modeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: "#1a222f",
  },
  modeTag: {
    color: "#3b82f6",
    fontSize: 10,
    fontWeight: "700",
  },
  exposureTag: {
    color: "#9ca3af",
    fontSize: 10,
  },
  metricsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    backgroundColor: "#080b10",
    padding: 8,
    borderRadius: 6,
  },
  metricItem: {
    alignItems: "center",
  },
  metricLabel: {
    color: "#6b7280",
    fontSize: 10,
  },
  metricVal: {
    color: "#f3f4f6",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  btn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: "center",
  },
  btnPause: {
    backgroundColor: "#1f2937",
    borderWidth: 1,
    borderColor: "#374151",
  },
  btnResume: {
    backgroundColor: "rgba(16, 185, 129, 0.2)",
    borderWidth: 1,
    borderColor: "#10b981",
  },
  btnKill: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    borderWidth: 1,
    borderColor: "#ef4444",
  },
  btnTextLight: {
    color: "#f3f4f6",
    fontSize: 11,
    fontWeight: "700",
  },
  killedBox: {
    flex: 1,
    paddingVertical: 6,
    alignItems: "center",
  },
});
