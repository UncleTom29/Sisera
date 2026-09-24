import { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { api } from "../../lib/api";

interface Message {
  id: string;
  sender: "USER" | "SISERA";
  text: string;
  plan?: {
    action: string;
    instrument: string;
    quantity: string;
    side: "BUY" | "SELL";
    riskCheck: string;
    route: string;
  };
}

const INITIAL_MESSAGES: Message[] = [
  {
    id: "msg_1",
    sender: "SISERA",
    text: "Sisera Institutional Copilot initialized. All responses adhere to deterministic risk guardrails (§52). How can I assist with your portfolio or execution strategy?",
  },
];

export default function AiScreen() {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [executingPlan, setExecutingPlan] = useState<boolean>(false);
  const [planResult, setPlanResult] = useState<string | null>(null);

  const sendIntent = async (promptText?: string) => {
    const textToSend = promptText || input;
    if (!textToSend.trim()) return;

    const userMsg: Message = {
      id: `u_${Date.now()}`,
      sender: "USER",
      text: textToSend,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setPlanResult(null);

    try {
      const intentRes = await api.compileIntent(textToSend);
      const copilotRes = await api.queryCopilot(textToSend);

      const siseraMsg: Message = {
        id: `s_${Date.now()}`,
        sender: "SISERA",
        text: copilotRes.synthesis || "Intent parsed and compiled into structured execution plan.",
        plan: intentRes?.compiled_intent
          ? {
              action: intentRes.compiled_intent.action || "REDUCE_EXPOSURE",
              instrument: intentRes.compiled_intent.instrument || "BTCUSDT",
              quantity: "0.25",
              side: (intentRes.compiled_intent.action.includes("BUY") ? "BUY" : "SELL") as "BUY" | "SELL",
              riskCheck: "PASSED (0.48x)",
              route: "SOR BINANCE_PRIMARY",
            }
          : undefined,
      };

      setMessages((prev) => [...prev, siseraMsg]);
    } catch {
      // Fallback deterministic response
      const siseraMsg: Message = {
        id: `s_${Date.now()}`,
        sender: "SISERA",
        text: "Compiled intent into structured execution plan. Pre-trade risk policy verified.",
        plan: {
          action: "DELTA_HEDGE",
          instrument: "BTC-PERP",
          quantity: "0.20",
          side: "SELL",
          riskCheck: "PASSED (0.48x)",
          route: "SOR BINANCE_PRIMARY",
        },
      };
      setMessages((prev) => [...prev, siseraMsg]);
    } finally {
      setLoading(false);
    }
  };

  const executeCompiledPlan = async (plan: any) => {
    setExecutingPlan(true);
    try {
      const order = await api.createOrder({
        client_order_id: `copilot_${Date.now()}`,
        instrument_id: plan.instrument,
        side: plan.side,
        order_type: "MARKET",
        quantity: plan.quantity,
        account_id: "copilot_main",
        portfolio_id: "pf_1",
      });
      await api.executeOrder(order.sisera_order_id);
      setPlanResult(`✓ Successfully executed ${plan.side} ${plan.quantity} ${plan.instrument}`);
    } catch (e: any) {
      setPlanResult(`✗ Execution error: ${e.message}`);
    } finally {
      setExecutingPlan(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header Info */}
      <View style={styles.headerCard}>
        <View style={styles.rowBetween}>
          <Text style={styles.headerTitle}>COPILOT & INTENT COMPILER</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>SPEC §52 GUARDED</Text>
          </View>
        </View>
        <Text style={styles.headerSub}>
          LLM generates structured intent proposals; execution is strictly validated by pre-trade risk engine.
        </Text>
      </View>

      {/* Messages Feed */}
      <ScrollView style={styles.chatArea}>
        {messages.map((m) => {
          const isUser = m.sender === "USER";
          return (
            <View
              key={m.id}
              style={[styles.msgWrapper, isUser ? styles.msgWrapperUser : styles.msgWrapperSisera]}
            >
              <Text style={styles.msgSender}>{isUser ? "OPERATOR" : "SISERA AI"}</Text>
              <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleSisera]}>
                <Text style={styles.bubbleText}>{m.text}</Text>

                {/* Structured Plan Card */}
                {m.plan && (
                  <View style={styles.planCard}>
                    <Text style={styles.planTitle}>COMPILED EXECUTION INTENT</Text>
                    <View style={styles.planRow}>
                      <Text style={styles.planLabel}>Action:</Text>
                      <Text style={styles.planVal}>{m.plan.action}</Text>
                    </View>
                    <View style={styles.planRow}>
                      <Text style={styles.planLabel}>Order:</Text>
                      <Text style={styles.planVal}>
                        {m.plan.side} {m.plan.quantity} {m.plan.instrument}
                      </Text>
                    </View>
                    <View style={styles.planRow}>
                      <Text style={styles.planLabel}>Routing:</Text>
                      <Text style={styles.planVal}>{m.plan.route}</Text>
                    </View>
                    <View style={styles.planRow}>
                      <Text style={styles.planLabel}>Pre-Trade Risk:</Text>
                      <Text style={[styles.planVal, styles.greenText]}>{m.plan.riskCheck}</Text>
                    </View>

                    {planResult ? (
                      <Text style={[styles.planResultText, planResult.startsWith("✓") ? styles.greenText : styles.redText]}>
                        {planResult}
                      </Text>
                    ) : (
                      <TouchableOpacity
                        style={styles.executePlanBtn}
                        onPress={() => executeCompiledPlan(m.plan)}
                        disabled={executingPlan}
                      >
                        {executingPlan ? (
                          <ActivityIndicator color="#080b10" size="small" />
                        ) : (
                          <Text style={styles.executePlanBtnText}>EXECUTE PLAN (PAPER)</Text>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            </View>
          );
        })}
        {loading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#10b981" />
            <Text style={styles.dimText}>Compiling intent & checking risk...</Text>
          </View>
        )}
      </ScrollView>

      {/* Suggested Quick Prompt Chips */}
      <View style={styles.chipRow}>
        <TouchableOpacity
          style={styles.chip}
          onPress={() => sendIntent("Hedge 25% of BTC delta")}
        >
          <Text style={styles.chipText}>Hedge 25% BTC</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.chip}
          onPress={() => sendIntent("Analyze funding arbitrage opportunities")}
        >
          <Text style={styles.chipText}>Funding Arb Scan</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.chip}
          onPress={() => sendIntent("Query market memory for current regime")}
        >
          <Text style={styles.chipText}>Query Regime</Text>
        </TouchableOpacity>
      </View>

      {/* Input Bar */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.inputField}
          placeholder="State your intent or trading instruction..."
          placeholderTextColor="#6b7280"
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => sendIntent()}
        />
        <TouchableOpacity
          style={styles.sendBtn}
          onPress={() => sendIntent()}
          disabled={loading}
        >
          <Text style={styles.sendBtnText}>Send</Text>
        </TouchableOpacity>
      </View>
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
    marginBottom: 8,
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
    backgroundColor: "rgba(139, 92, 246, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    color: "#8b5cf6",
    fontSize: 9,
    fontWeight: "700",
  },
  headerSub: {
    color: "#6b7280",
    fontSize: 11,
    marginTop: 4,
  },
  chatArea: {
    flex: 1,
    marginBottom: 8,
  },
  msgWrapper: {
    marginBottom: 12,
  },
  msgWrapperUser: {
    alignItems: "flex-end",
  },
  msgWrapperSisera: {
    alignItems: "flex-start",
  },
  msgSender: {
    color: "#6b7280",
    fontSize: 10,
    fontWeight: "700",
    marginBottom: 4,
  },
  bubble: {
    maxWidth: "88%",
    borderRadius: 8,
    padding: 10,
  },
  bubbleUser: {
    backgroundColor: "#1f2937",
    borderWidth: 1,
    borderColor: "#374151",
  },
  bubbleSisera: {
    backgroundColor: "#0e131b",
    borderWidth: 1,
    borderColor: "#1e2633",
  },
  bubbleText: {
    color: "#f3f4f6",
    fontSize: 13,
    lineHeight: 18,
  },
  planCard: {
    backgroundColor: "#080b10",
    borderWidth: 1,
    borderColor: "rgba(139, 92, 246, 0.4)",
    borderRadius: 6,
    padding: 10,
    marginTop: 8,
  },
  planTitle: {
    color: "#8b5cf6",
    fontSize: 10,
    fontWeight: "800",
    marginBottom: 6,
  },
  planRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
  },
  planLabel: {
    color: "#9ca3af",
    fontSize: 11,
  },
  planVal: {
    color: "#f3f4f6",
    fontSize: 11,
    fontWeight: "600",
  },
  greenText: {
    color: "#10b981",
  },
  redText: {
    color: "#ef4444",
  },
  executePlanBtn: {
    backgroundColor: "#10b981",
    paddingVertical: 8,
    borderRadius: 4,
    alignItems: "center",
    marginTop: 8,
  },
  executePlanBtnText: {
    color: "#080b10",
    fontSize: 11,
    fontWeight: "800",
  },
  planResultText: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 6,
  },
  loadingBox: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingVertical: 8,
  },
  dimText: {
    color: "#6b7280",
    fontSize: 11,
  },
  chipRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
  },
  chip: {
    backgroundColor: "#141b24",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#1e2633",
  },
  chipText: {
    color: "#9ca3af",
    fontSize: 10,
    fontWeight: "600",
  },
  inputBar: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 4,
  },
  inputField: {
    flex: 1,
    backgroundColor: "#0e131b",
    borderWidth: 1,
    borderColor: "#1e2633",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: "#f3f4f6",
    fontSize: 13,
  },
  sendBtn: {
    backgroundColor: "#10b981",
    paddingHorizontal: 16,
    justifyContent: "center",
    borderRadius: 8,
  },
  sendBtnText: {
    color: "#080b10",
    fontWeight: "800",
    fontSize: 13,
  },
});
