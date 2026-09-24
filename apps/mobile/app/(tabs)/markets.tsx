import { useEffect, useState } from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { api } from "../../lib/api";
import { formatAmount, formatCurrency, formatPct } from "@sisera/ui";

interface MarketItem {
  symbol: string;
  name: string;
  assetClass: "CRYPTO" | "FX" | "EQUITY" | "COMMODITY";
  price: string;
  change24h: number;
  volume24h: string;
  high24h: string;
  low24h: string;
}

const DEFAULT_MARKETS: MarketItem[] = [
  {
    symbol: "BTCUSDT",
    name: "Bitcoin / Tether",
    assetClass: "CRYPTO",
    price: "63420.50",
    change24h: 2.45,
    volume24h: "1.42B",
    high24h: "64100.00",
    low24h: "61980.00",
  },
  {
    symbol: "ETHUSDT",
    name: "Ethereum / Tether",
    assetClass: "CRYPTO",
    price: "3480.20",
    change24h: -1.15,
    volume24h: "890M",
    high24h: "3540.00",
    low24h: "3420.00",
  },
  {
    symbol: "SOLUSDT",
    name: "Solana / Tether",
    assetClass: "CRYPTO",
    price: "152.80",
    change24h: 4.82,
    volume24h: "420M",
    high24h: "155.40",
    low24h: "144.20",
  },
  {
    symbol: "EURUSD",
    name: "Euro / US Dollar",
    assetClass: "FX",
    price: "1.0845",
    change24h: 0.12,
    volume24h: "4.8B",
    high24h: "1.0862",
    low24h: "1.0820",
  },
  {
    symbol: "XAUUSD",
    name: "Gold / US Dollar",
    assetClass: "COMMODITY",
    price: "2410.80",
    change24h: 0.65,
    volume24h: "1.1B",
    high24h: "2422.00",
    low24h: "2398.50",
  },
  {
    symbol: "NVDA",
    name: "NVIDIA Corporation",
    assetClass: "EQUITY",
    price: "128.50",
    change24h: 3.10,
    volume24h: "2.8B",
    high24h: "130.20",
    low24h: "124.60",
  },
];

export default function MarketsScreen() {
  const [filter, setFilter] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [markets, setMarkets] = useState<MarketItem[]>(DEFAULT_MARKETS);

  const fetchMarkets = async () => {
    try {
      const ticker = await api.getTicker("BTCUSDT");
      if (ticker?.last_price) {
        setMarkets((prev) =>
          prev.map((m) =>
            m.symbol === "BTCUSDT"
              ? {
                  ...m,
                  price: ticker.last_price,
                  change24h: ticker.change_24h_pct ? Number(ticker.change_24h_pct) : m.change24h,
                  volume24h: ticker.volume_24h ? `${Number(ticker.volume_24h).toFixed(0)}M` : m.volume24h,
                }
              : m
          )
        );
      }
    } catch {
      // Keep static defaults on network variance
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchMarkets();
    setRefreshing(false);
  };

  useEffect(() => {
    fetchMarkets();
  }, []);

  const filtered = markets.filter((m) => {
    const matchesFilter = filter === "ALL" || m.assetClass === filter;
    const matchesSearch =
      m.symbol.toLowerCase().includes(search.toLowerCase()) ||
      m.name.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <View style={styles.container}>
      {/* Search Input */}
      <TextInput
        style={styles.searchInput}
        placeholder="Search symbols or names..."
        placeholderTextColor="#6b7280"
        value={search}
        onChangeText={setSearch}
      />

      {/* Asset Class Filter Pills */}
      <View style={styles.pillContainer}>
        {["ALL", "CRYPTO", "FX", "COMMODITY", "EQUITY"].map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.pill, filter === cat && styles.pillActive]}
            onPress={() => setFilter(cat)}
          >
            <Text style={[styles.pillText, filter === cat && styles.pillTextActive]}>
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Markets List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.symbol}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />
        }
        renderItem={({ item }) => {
          const isUp = item.change24h >= 0;
          return (
            <View style={styles.marketCard}>
              <View style={styles.leftCol}>
                <View style={styles.symbolRow}>
                  <Text style={styles.symbolText}>{item.symbol}</Text>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.assetClass}</Text>
                  </View>
                </View>
                <Text style={styles.nameText}>{item.name}</Text>
                <Text style={styles.volText}>24h Vol: ${item.volume24h}</Text>
              </View>

              <View style={styles.rightCol}>
                <Text style={styles.priceText}>{formatCurrency(item.price)}</Text>
                <View style={[styles.changeBox, isUp ? styles.changeBoxUp : styles.changeBoxDown]}>
                  <Text style={[styles.changeText, isUp ? styles.greenText : styles.redText]}>
                    {formatPct(item.change24h)}
                  </Text>
                </View>
                <Text style={styles.rangeText}>
                  L: {formatAmount(item.low24h)} H: {formatAmount(item.high24h)}
                </Text>
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
  searchInput: {
    backgroundColor: "#0f141c",
    borderWidth: 1,
    borderColor: "#1e2633",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#f3f4f6",
    fontSize: 13,
    marginBottom: 10,
  },
  pillContainer: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 12,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#0e131b",
    borderWidth: 1,
    borderColor: "#1e2633",
  },
  pillActive: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    borderColor: "#10b981",
  },
  pillText: {
    color: "#9ca3af",
    fontSize: 11,
    fontWeight: "600",
  },
  pillTextActive: {
    color: "#10b981",
    fontWeight: "700",
  },
  marketCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#0e131b",
    borderWidth: 1,
    borderColor: "#1e2633",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  leftCol: {
    flex: 1,
  },
  symbolRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  symbolText: {
    color: "#f3f4f6",
    fontSize: 15,
    fontWeight: "700",
  },
  badge: {
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    color: "#3b82f6",
    fontSize: 9,
    fontWeight: "700",
  },
  nameText: {
    color: "#6b7280",
    fontSize: 11,
    marginTop: 2,
  },
  volText: {
    color: "#9ca3af",
    fontSize: 10,
    marginTop: 4,
  },
  rightCol: {
    alignItems: "flex-end",
  },
  priceText: {
    color: "#f3f4f6",
    fontSize: 15,
    fontWeight: "700",
  },
  changeBox: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  changeBoxUp: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
  },
  changeBoxDown: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
  },
  changeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  greenText: {
    color: "#10b981",
  },
  redText: {
    color: "#ef4444",
  },
  rangeText: {
    color: "#6b7280",
    fontSize: 9,
    marginTop: 4,
  },
});
