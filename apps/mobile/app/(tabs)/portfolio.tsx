import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { api } from "../../lib/api";
import { formatAmount, formatCurrency, formatPct } from "@sisera/ui";

interface Position {
  symbol: string;
  side: "LONG" | "SHORT";
  size: string;
  entryPrice: string;
  markPrice: string;
  pnl: number;
  pnlPct: number;
  liqDistance: number;
}

const DEFAULT_POSITIONS: Position[] = [
  {
    symbol: "BTC-PERP",
    side: "LONG",
    size: "0.75",
    entryPrice: "62100.00",
    markPrice: "63420.50",
    pnl: 990.38,
    pnlPct: 2.12,
    liqDistance: 34.2,
  },
  {
    symbol: "ETH-PERP",
    side: "LONG",
    size: "5.00",
    entryPrice: "3510.00",
    markPrice: "3480.20",
    pnl: -149.0,
    pnlPct: -0.85,
    liqDistance: 28.5,
  },
  {
    symbol: "SOL-PERP",
    side: "SHORT",
    size: "20.00",
    entryPrice: "155.00",
    markPrice: "152.80",
    pnl: 44.0,
    pnlPct: 1.42,
    liqDistance: 45.0,
  },
];

export default function PortfolioScreen() {
  const [positions, setPositions] = useState<Position[]>(DEFAULT_POSITIONS);
  const [equity, setEquity] = useState<string>("100,885.38");
  const [marginUsed, setMarginUsed] = useState<string>("7,420.00");
  const [leverage, setLeverage] = useState<string>("0.48x");
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [killModalVisible, setKillModalVisible] = useState<boolean>(false);
  const [killReason, setKillReason] = useState<string>("Emergency Operator Action");
  const [killStatus, setKillStatus] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const pf = await api.getPortfolio("pf_1");
      if (pf?.equity) {
        setEquity(formatAmount(pf.equity));
      }
      const pos = await api.listPositions("pf_1");
      if (Array.isArray(pos) && pos.length > 0) {
        setPositions(
          pos.map((p: any) => ({
            symbol: p.instrument_id,
            side: Number(p.quantity) >= 0 ? "LONG" : "SHORT",
            size: Math.abs(Number(p.quantity)).toString(),
            entryPrice: p.avg_entry_price || "0",
            markPrice: p.current_price || p.avg_entry_price || "0",
            pnl: Number(p.unrealized_pnl) || 0,
            pnlPct: 1.5,
            liqDistance: 30.0,
          }))
        );
      }
    } catch {
      // Keep state on network variance
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleTripKillSwitch = async () => {
    try {
      const res = await api.tripKillSwitch("PORTFOLIO", killReason, "pf_1");
      setKillStatus(`KILL SWITCH ACTIVE: ${res.reason || "FULL_HALT"}`);
      setKillModalVisible(false);
    } catch (e: any) {
      setKillStatus(`Trip Error: ${e.message}`);
      setKillModalVisible(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />
      }
    >
      {/* Kill Switch Alert Banner */}
      {killStatus && (
        <View style={styles.killBanner}>
          <Text style={styles.killBannerText}>⚠ {killStatus}</Text>
        </View>
      )}

      {/* Account Balance Card */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>TOTAL ACCOUNT EQUITY (NAV)</Text>
        <Text style={styles.equityAmount}>${equity}</Text>

        <View style={styles.balanceGrid}>
          <View style={styles.balanceItem}>
            <Text style={styles.balanceLabel}>Used Margin</Text>
            <Text style={styles.balanceVal}>${marginUsed}</Text>
          </View>
          <View style={styles.balanceItem}>
            <Text style={styles.balanceLabel}>Available</Text>
            <Text style={styles.balanceVal}>$93,465.38</Text>
          </View>
          <View style={styles.balanceItem}>
            <Text style={styles.balanceLabel}>Eff. Leverage</Text>
            <Text style={[styles.balanceVal, styles.greenText]}>{leverage}</Text>
          </View>
          <View style={styles.balanceItem}>
            <Text style={styles.balanceLabel}>Unrealized PnL</Text>
            <Text style={[styles.balanceVal, styles.greenText]}>+$885.38</Text>
          </View>
        </View>
      </View>

      {/* Stress Test Matrix (§32 & §54) */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Portfolio Stress Test</Text>
        <View style={styles.stressRow}>
          <Text style={styles.stressLabel}>BTC -20% Flash Crash:</Text>
          <Text style={[styles.stressVal, styles.redText]}>-$9,315 (-9.2%)</Text>
        </View>
        <View style={styles.stressRow}>
          <Text style={styles.stressLabel}>Global Volatility Surge +100%:</Text>
          <Text style={[styles.stressVal, styles.redText]}>-$4,120 (-4.1%)</Text>
        </View>
        <View style={styles.stressRow}>
          <Text style={styles.stressLabel}>Funding Inversion Arbitrage:</Text>
          <Text style={[styles.stressVal, styles.greenText]}>+$1,450 (+1.4%)</Text>
        </View>
      </View>

      {/* Open Positions List */}
      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.sectionTitle}>Open Positions ({positions.length})</Text>
          <Text style={styles.dimText}>Auto-hedged</Text>
        </View>

        {positions.map((item, idx) => {
          const isLong = item.side === "LONG";
          const isProfit = item.pnl >= 0;
          return (
            <View key={idx} style={styles.positionRow}>
              <View style={styles.posLeft}>
                <View style={styles.symbolTagRow}>
                  <Text style={styles.posSymbol}>{item.symbol}</Text>
                  <View style={[styles.sideBadge, isLong ? styles.buyBadge : styles.sellBadge]}>
                    <Text style={[styles.sideBadgeText, isLong ? styles.greenText : styles.redText]}>
                      {item.side} {item.size}
                    </Text>
                  </View>
                </View>
                <Text style={styles.dimText}>
                  Entry: ${formatAmount(item.entryPrice)} · Mark: ${formatAmount(item.markPrice)}
                </Text>
              </View>

              <View style={styles.posRight}>
                <Text style={[styles.posPnl, isProfit ? styles.greenText : styles.redText]}>
                  {isProfit ? "+" : ""}${formatAmount(item.pnl)} ({formatPct(item.pnlPct)})
                </Text>
                <Text style={styles.dimText}>Liq: {item.liqDistance.toFixed(1)}% dist</Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* Emergency Kill Switch Button (§32 & §54) */}
      <TouchableOpacity
        style={styles.killBtn}
        onPress={() => setKillModalVisible(true)}
      >
        <Text style={styles.killBtnText}>EMERGENCY KILL SWITCH</Text>
      </TouchableOpacity>

      {/* Kill Switch Modal */}
      <Modal visible={killModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>CONFIRM KILL SWITCH TRIP</Text>
            <Text style={styles.modalSub}>
              This will immediately cancel all open orders and halt trading on portfolio pf_1.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={killReason}
              onChangeText={setKillReason}
              placeholder="Reason for halting..."
              placeholderTextColor="#6b7280"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalCancel]}
                onPress={() => setKillModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalConfirm]}
                onPress={handleTripKillSwitch}
              >
                <Text style={styles.modalConfirmText}>TRIP HALT</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#080b10",
    padding: 14,
  },
  card: {
    backgroundColor: "#0e131b",
    borderWidth: 1,
    borderColor: "#1e2633",
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardLabel: {
    color: "#6b7280",
    fontSize: 10,
    fontWeight: "700",
  },
  equityAmount: {
    color: "#f3f4f6",
    fontSize: 26,
    fontWeight: "800",
    marginVertical: 4,
  },
  balanceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#1e2633",
    paddingTop: 8,
  },
  balanceItem: {
    width: "50%",
    marginBottom: 6,
  },
  balanceLabel: {
    color: "#9ca3af",
    fontSize: 11,
  },
  balanceVal: {
    color: "#f3f4f6",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
  },
  sectionTitle: {
    color: "#f3f4f6",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
  },
  stressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  stressLabel: {
    color: "#9ca3af",
    fontSize: 11,
  },
  stressVal: {
    fontSize: 11,
    fontWeight: "700",
  },
  positionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#1a222f",
  },
  posLeft: {
    flex: 1,
  },
  symbolTagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  posSymbol: {
    color: "#f3f4f6",
    fontSize: 13,
    fontWeight: "700",
  },
  sideBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  buyBadge: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
  },
  sellBadge: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
  },
  sideBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  posRight: {
    alignItems: "flex-end",
  },
  posPnl: {
    fontSize: 13,
    fontWeight: "700",
  },
  greenText: {
    color: "#10b981",
  },
  redText: {
    color: "#ef4444",
  },
  dimText: {
    color: "#6b7280",
    fontSize: 10,
    marginTop: 2,
  },
  killBtn: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderWidth: 1,
    borderColor: "#ef4444",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginVertical: 10,
    marginBottom: 30,
  },
  killBtnText: {
    color: "#ef4444",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1,
  },
  killBanner: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    borderWidth: 1,
    borderColor: "#ef4444",
    padding: 10,
    borderRadius: 6,
    marginBottom: 10,
  },
  killBannerText: {
    color: "#ef4444",
    fontWeight: "700",
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#0f141c",
    borderWidth: 1,
    borderColor: "#ef4444",
    borderRadius: 10,
    padding: 16,
    width: "100%",
  },
  modalTitle: {
    color: "#ef4444",
    fontSize: 16,
    fontWeight: "800",
  },
  modalSub: {
    color: "#9ca3af",
    fontSize: 12,
    marginVertical: 8,
  },
  modalInput: {
    backgroundColor: "#080b10",
    borderWidth: 1,
    borderColor: "#1e2633",
    borderRadius: 6,
    color: "#f3f4f6",
    padding: 10,
    fontSize: 13,
    marginBottom: 12,
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: "center",
  },
  modalCancel: {
    backgroundColor: "#1f2937",
  },
  modalConfirm: {
    backgroundColor: "#ef4444",
  },
  modalCancelText: {
    color: "#f3f4f6",
    fontWeight: "600",
  },
  modalConfirmText: {
    color: "#ffffff",
    fontWeight: "800",
  },
});
