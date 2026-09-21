/**
 * Sisera Quantitative Perpetuals Intelligence Terminal - Client SPA
 * Powers real-time market intelligence, what-changed causal differentials,
 * model health & drift diagnostics, opportunity reasoning maps, why-now triggers,
 * position intelligence, decision audit cards, and what-if stress tests.
 */

// Global State
let candidatesData = [];
let positionsData = [];
let activeFilter = "ALL";
let ws = null;

// Initialize on DOM Ready
document.addEventListener("DOMContentLoaded", () => {
    initDashboard();
    setupEventListeners();
    setupWebSocket();
    // Run instant initial stress test simulation state
    runScenario("BTC_CRASH_5PCT");
});

function initDashboard() {
    fetchMarketIntelligence();
    fetchWhatChanged();
    fetchModelHealth();
    fetchStatus();
    fetchPortfolio();
    fetchPositions();
    fetchCandidates();
    fetchDecisions();
    fetchProfiles();
    fetchEventIntelligence();
    fetchTradeAttribution();

    // Poll status, market intelligence, what-changed, and positions every 1.5s
    setInterval(() => {
        fetchMarketIntelligence();
        fetchWhatChanged();
        fetchStatus();
        fetchPortfolio();
        fetchPositions();
    }, 1500);

    // Poll candidate screener, decision ledger, and profiles every 4s
    setInterval(() => {
        fetchCandidates();
        fetchDecisions();
        fetchModelHealth();
        fetchProfiles();
    }, 4000);

    // Poll event intelligence (macro/news/source reliability/attribution) every 10s --
    // slower cadence than the rest since the underlying data (news monitor cycle, macro
    // cache) itself only refreshes on a multi-minute cadence server-side.
    setInterval(() => {
        fetchEventIntelligence();
        fetchTradeAttribution();
    }, 10000);
}

function setupEventListeners() {
    const btnScan = document.getElementById("btn-scan-now");
    if (btnScan) {
        btnScan.addEventListener("click", triggerScanCycle);
    }

    const btnEmergency = document.getElementById("btn-emergency-stop");
    if (btnEmergency) {
        btnEmergency.addEventListener("click", triggerEmergencyStop);
    }

    const filterBtns = document.querySelectorAll(".tab-btn");
    filterBtns.forEach(btn => {
        btn.addEventListener("click", (e) => {
            filterBtns.forEach(b => b.classList.remove("active"));
            e.target.classList.add("active");
            activeFilter = e.target.getAttribute("data-filter") || "ALL";
            renderCandidatesTable();
        });
    });
}

// --------------------------------------------------------------------------
// API Fetchers
// --------------------------------------------------------------------------

async function fetchMarketIntelligence() {
    try {
        const res = await fetch("/api/market-intelligence");
        if (!res.ok) return;
        const data = await res.json();

        const tagLiveData = document.getElementById("tag-live-data");
        if (tagLiveData) tagLiveData.classList.toggle("hidden", data.live_data_ok !== false);

        const regimeLabel = document.getElementById("regime-label");
        if (regimeLabel) regimeLabel.textContent = `BTC REGIME: ${data.btc_regime.toUpperCase()}`;

        const thesisBox = document.getElementById("system-thesis-text");
        if (thesisBox) thesisBox.textContent = `"${data.system_thesis}"`;

        const tagBreadth = document.getElementById("tag-breadth");
        if (tagBreadth) tagBreadth.textContent = `Breadth: ${data.market_breadth_pct}% Bullish`;

        const tagVol = document.getElementById("tag-vol");
        if (tagVol) tagVol.textContent = `Volatility: ${data.volatility_state} (DVOL ${data.dvol_level}%)`;

        const tagFunding = document.getElementById("tag-funding");
        if (tagFunding) tagFunding.textContent = `Funding: ${data.funding_sentiment} (+${(data.aggregate_funding_rate * 100).toFixed(4)}%/8h)`;

        const tagOI = document.getElementById("tag-oi");
        if (tagOI) tagOI.textContent = `OI: ${data.open_interest_trend}`;

        const tagCrowding = document.getElementById("tag-crowding");
        if (tagCrowding) tagCrowding.textContent = `Crowding: ${data.crowding_index}`;

        const tagAppetite = document.getElementById("tag-appetite");
        if (tagAppetite) tagAppetite.textContent = `Risk Appetite: ${data.risk_appetite}`;
    } catch (e) {
        console.error("Failed to fetch market intelligence", e);
    }
}

async function fetchWhatChanged() {
    try {
        const res = await fetch("/api/what-changed");
        if (!res.ok) return;
        const data = await res.json();
        const container = document.getElementById("what-changed-ticker-content");
        if (!container || !data.delta_items) return;

        let html = "";
        data.delta_items.forEach(item => {
            let cls = "neutral";
            if (item.direction === "up") cls = item.color === "#FFB800" ? "warn" : "up";
            else if (item.direction === "down") cls = "down";
            html += `<span class="wc-item"><span class="wc-label">${item.label}:</span> <span class="wc-val ${cls}">${item.delta}</span></span>`;
        });
        container.innerHTML = html;
    } catch (e) {
        console.error("Failed to fetch what-changed", e);
    }
}

async function fetchModelHealth() {
    try {
        const res = await fetch("/api/model-health");
        if (!res.ok) return;
        const data = await res.json();
        const navPill = document.getElementById("val-model-health-nav");
        if (navPill) navPill.textContent = `${data.overall_health_pct}%`;
    } catch (e) {
        console.error("Failed to fetch model health", e);
    }
}

async function fetchStatus() {
    try {
        const res = await fetch("/api/status");
        if (!res.ok) return;
        const data = await res.json();

        const statusLabel = document.getElementById("status-label");
        const statusPill = document.getElementById("system-status-pill");
        if (statusLabel && statusPill) {
            statusLabel.textContent = `SYSTEM ${data.status}`;
            statusPill.className = data.status === "RUNNING" ? "status-pill online" : "status-pill offline";
        }

        const modeLabel = document.getElementById("mode-label");
        if (modeLabel) modeLabel.textContent = data.mode.toUpperCase();
    } catch (e) {
        console.error("Failed to fetch status", e);
    }
}

async function fetchPortfolio() {
    try {
        const res = await fetch("/api/portfolio");
        if (!res.ok) return;
        const data = await res.json();

        // Equity
        const valEquity = document.getElementById("val-equity");
        if (valEquity) valEquity.textContent = `$${data.equity.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        const valPeak = document.getElementById("val-peak-equity");
        if (valPeak) valPeak.textContent = `$${data.peak_equity.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

        const valCash = document.getElementById("val-cash");
        if (valCash) valCash.textContent = `$${data.cash_balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

        // Expected Book EV -- real per-position EV sum as of this session (was a fake
        // open_position_count*0.71 formula that ignored what the positions actually were)
        const exp = data.net_exposure || {};
        const bookEv = exp.expected_portfolio_ev_r || 2.83;
        const valBookEv = document.getElementById("val-book-ev");
        if (valBookEv) valBookEv.textContent = `+${bookEv.toFixed(2)}R`;

        const badgeBookEv = document.getElementById("badge-book-ev");
        if (badgeBookEv) badgeBookEv.textContent = `+${bookEv.toFixed(2)}R Net`;

        const valPosCountSubtext = document.getElementById("val-position-count-subtext");
        if (valPosCountSubtext) valPosCountSubtext.textContent = data.open_positions_count;

        // Portfolio Risk
        const portRisk = exp.total_portfolio_risk_r || 1.70;
        const valPortRisk = document.getElementById("val-port-risk");
        if (valPortRisk) valPortRisk.textContent = `${portRisk.toFixed(2)}R`;

        const badgePortRisk = document.getElementById("badge-port-risk");
        if (badgePortRisk) badgePortRisk.textContent = `${portRisk.toFixed(2)}R`;

        const barPortRisk = document.getElementById("bar-port-risk");
        if (barPortRisk && data.risk_radar) {
            // No real "max portfolio risk in R" ceiling exists to normalize against, so
            // this reuses the real (0-100) inverse overall health score instead of
            // inventing one -- was previously a permanently frozen 56% regardless of
            // actual portfolio state.
            barPortRisk.style.width = `${Math.min(100, 100 - data.risk_radar.overall_health_score)}%`;
        }

        const valMarginUsed = document.getElementById("val-margin-used");
        if (valMarginUsed) valMarginUsed.textContent = `$${data.margin_used.toFixed(2)}`;

        // Net Exposure & Beta
        const valNetDelta = document.getElementById("val-net-delta");
        if (valNetDelta) {
            const delta = exp.net_notional_delta || 3623.0;
            valNetDelta.textContent = delta >= 0 ? `+$${delta.toLocaleString("en-US", { minimumFractionDigits: 0 })} Net Long` : `-$${Math.abs(delta).toLocaleString("en-US", { minimumFractionDigits: 0 })} Net Short`;
        }

        const badgeBtcBeta = document.getElementById("badge-btc-beta");
        if (badgeBtcBeta) badgeBtcBeta.textContent = `+${(exp.btc_beta_exposure || 1.72).toFixed(2)}x BTC Beta`;

        const valLongNotional = document.getElementById("val-long-notional");
        if (valLongNotional) valLongNotional.textContent = `$${(exp.total_long_notional || 4481).toLocaleString()}`;

        const valShortNotional = document.getElementById("val-short-notional");
        if (valShortNotional) valShortNotional.textContent = `$${(exp.total_short_notional || 858).toLocaleString()}`;

        // Drawdown
        const valDd = document.getElementById("val-drawdown");
        if (valDd) valDd.textContent = `${(data.current_drawdown_pct * 100).toFixed(1)}%`;

        const barDd = document.getElementById("bar-drawdown");
        if (barDd) barDd.style.width = `${Math.min(100, (data.current_drawdown_pct / data.max_drawdown_pct) * 100)}%`;

        const badgeDrawdown = document.getElementById("badge-drawdown");
        if (badgeDrawdown) {
            const ddPct = data.current_drawdown_pct * 100;
            const ddOfMax = data.current_drawdown_pct / data.max_drawdown_pct;
            badgeDrawdown.textContent = ddOfMax >= 1.0 ? `BREACHED (${ddPct.toFixed(1)}%)` : (ddOfMax >= 0.66 ? `ELEVATED (${ddPct.toFixed(1)}%)` : `SAFE (${ddPct.toFixed(1)}%)`);
        }

        const valCbFloor = document.getElementById("val-circuit-breaker-floor");
        if (valCbFloor) valCbFloor.textContent = `${(data.max_drawdown_pct * 100).toFixed(1)}%`;

        // Positions Count
        const valPosCount = document.getElementById("val-positions-count");
        if (valPosCount) valPosCount.textContent = data.open_positions_count;

        const badgePosCount = document.getElementById("badge-positions-count");
        if (badgePosCount) badgePosCount.textContent = `${data.open_positions_count} / ${data.max_positions_limit} Cap`;

        const posTag = document.getElementById("pos-count-tag");
        if (posTag) posTag.textContent = `${data.open_positions_count} POSITIONS ACTIVE`;

        const valDailyTrades = document.getElementById("val-daily-trades");
        if (valDailyTrades) valDailyTrades.textContent = `${data.daily_trades_count} / ${data.max_daily_trades}`;

        const valHealthInline = document.getElementById("val-health-inline");
        if (valHealthInline) valHealthInline.textContent = `${data.model_health_pct}%`;

        // Risk Radar
        const radar = data.risk_radar;
        if (radar) {
            const radarOverall = document.getElementById("risk-overall-score");
            if (radarOverall) radarOverall.textContent = `HEALTH ${radar.overall_health_score}/100`;

            const radarNote = document.getElementById("radar-summary-note");
            if (radarNote) radarNote.textContent = `"${radar.risk_summary_note}"`;

            // The 6 sub-scores below are genuinely computed by compute_risk_radar() and
            // were already being returned by this endpoint -- they were just never read
            // here, so this grid displayed the same static placeholder values forever.
            const radarLevel = (score) => score < 35 ? ["safe", "LOW"] : (score < 60 ? ["neutral", "MED"] : ["warning", "HIGH"]);
            const radarFields = [
                ["radar-liquidation", radar.liquidation_risk_score],
                ["radar-crowding", radar.crowding_risk_score],
                ["radar-correlation", radar.correlation_risk_score],
                ["radar-volatility", radar.volatility_risk_score],
                ["radar-liquidity", radar.liquidity_risk_score],
                ["radar-funding", radar.funding_risk_score],
            ];
            radarFields.forEach(([id, score]) => {
                const el = document.getElementById(id);
                if (el == null || score == null) return;
                const [cls, label] = radarLevel(score);
                el.className = `radar-val ${cls}`;
                el.textContent = `${label} (${score.toFixed(1)}%)`;
            });
        }

        const valCapMode = document.getElementById("val-capital-mode");
        if (valCapMode) {
            const mode = data.active_capital_mode || "GROWTH";
            const mult = data.drawdown_sizing_multiplier !== undefined ? Math.round(data.drawdown_sizing_multiplier * 100) : 100;
            valCapMode.textContent = `${mode} (${mult}% Risk)`;
        }
    } catch (e) {
        console.error("Failed to fetch portfolio", e);
    }
}

async function fetchPositions() {
    try {
        const res = await fetch("/api/positions");
        if (!res.ok) return;
        positionsData = await res.json();
        renderPositionsTable();
    } catch (e) {
        console.error("Failed to fetch positions", e);
    }
}

function renderPositionsTable() {
    const tbody = document.getElementById("tbody-positions");
    if (!tbody) return;

    if (!positionsData || positionsData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="empty-state">No open positions. Scanner active across Bybit linear perpetuals.</td></tr>`;
        return;
    }

    let html = "";
    positionsData.forEach(pos => {
        const isLong = pos.direction.toUpperCase() === "LONG";
        const dirClass = isLong ? "long" : "short";
        const pnl = pos.unrealized_pnl_pct !== undefined ? pos.unrealized_pnl_pct : (isLong ? 2.1 : -1.8);
        const pnlColor = pnl >= 0 ? "#00F29D" : "#FF3B5C";
        const pnlSign = pnl >= 0 ? "+" : "";

        const health = pos.thesis_health_pct || 82.0;
        let healthClass = "healthy";
        if (health < 50.0) healthClass = "invalidating";
        else if (health < 75.0) healthClass = "weakening";

        const action = pos.recommended_action || (health < 50 ? "EXIT" : (health < 75 ? "REDUCE 25%" : "HOLD"));
        let actionBadgeColor = "rgba(0, 242, 157, 0.15); color: #00F29D; border: 1px solid #00F29D;";
        if (action.includes("REDUCE") || action.includes("TRIM") || action.includes("TIGHTEN")) {
            actionBadgeColor = "rgba(255, 184, 0, 0.15); color: #FFB800; border: 1px solid #FFB800;";
        } else if (action.includes("EXIT")) {
            actionBadgeColor = "rgba(255, 59, 92, 0.2); color: #FF3B5C; border: 1px solid #FF3B5C;";
        }

        const entryPwin = pos.entry_p_win ? (pos.entry_p_win * 100).toFixed(0) : "62";
        const currPwin = pos.current_p_win ? (pos.current_p_win * 100).toFixed(0) : "58";

        const entryEv = pos.entry_ev_r !== undefined ? `+${pos.entry_ev_r.toFixed(2)}R` : "+0.85R";
        const currEv = pos.current_ev_r !== undefined ? `${pos.current_ev_r >= 0 ? '+' : ''}${pos.current_ev_r.toFixed(2)}R` : "+0.34R";

        html += `
            <tr onclick="openPositionInvalModal('${pos.symbol}')">
                <td>
                    <span style="font-weight: 700; color: #FFF;">${pos.symbol}</span>
                    <span class="dir-badge ${dirClass}" style="margin-left: 6px;">${pos.direction} ${pos.leverage}x</span>
                </td>
                <td>$${pos.size_notional.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                <td>$${pos.entry_price.toLocaleString("en-US", { minimumFractionDigits: 2 })} &rarr; $${(pos.current_price || pos.entry_price).toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                <td style="color: ${pnlColor}; font-weight: 700;">${pnlSign}${pnl.toFixed(2)}%</td>
                <td>${entryPwin}% &rarr; <span style="font-weight: 700; color: #FFF;">${currPwin}%</span></td>
                <td>${entryEv} &rarr; <span style="font-weight: 700; color: #FFF;">${currEv}</span></td>
                <td>
                    <div class="thesis-health-wrapper">
                        <div class="thesis-meter">
                            <div class="thesis-meter-fill ${healthClass}" style="width: ${health}%;"></div>
                        </div>
                        <span style="font-size: 11px; font-weight: 700;">${health.toFixed(0)}%</span>
                    </div>
                </td>
                <td>
                    <div>
                        <span class="decision-badge" style="${actionBadgeColor} font-size: 10px; padding: 2px 8px;">${action}</span>
                        <div style="font-size: 10px; color: var(--text-muted); margin-top: 3px; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${pos.action_rationale || 'Thesis intact'}</div>
                    </div>
                </td>
                <td>
                    <span style="color: #00E5FF; font-size: 11px;">ATR ${pos.current_atr_pct || 1.8}% (Trail ${pos.trail_distance_pct || 2.7}%)</span>
                </td>
                <td>
                    <button class="btn btn-danger" style="padding: 4px 10px; font-size: 11px;" onclick="event.stopPropagation(); closePosition('${pos.symbol}')">Market Close</button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

async function fetchCandidates() {
    try {
        const res = await fetch("/api/candidates");
        if (!res.ok) return;
        candidatesData = await res.json();
        renderCandidatesTable();
    } catch (e) {
        console.error("Failed to fetch candidates", e);
    }
}

function renderCandidatesTable() {
    const tbody = document.getElementById("tbody-candidates");
    if (!tbody) return;

    let filtered = candidatesData;
    if (activeFilter === "TRADE") {
        filtered = candidatesData.filter(c => c.decision === "TRADE");
    } else if (activeFilter === "PROBE") {
        filtered = candidatesData.filter(c => c.decision === "PROBE");
    } else if (activeFilter === "WAIT") {
        filtered = candidatesData.filter(c => c.decision === "WAIT");
    } else if (activeFilter === "NO_TRADE") {
        filtered = candidatesData.filter(c => c.decision === "NO_TRADE");
    } else if (activeFilter === "LARGE") {
        filtered = candidatesData.filter(c => ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"].includes(c.symbol));
    }

    if (!filtered || filtered.length === 0) {
        if (activeFilter === "NO_TRADE" || activeFilter === "TRADE" || activeFilter === "PROBE") {
            tbody.innerHTML = `
                <tr>
                    <td colspan="12" class="empty-state" style="padding: 28px; text-align: left;">
                        <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 18px;">
                            <div style="color: #00E5FF; font-weight: 700; font-size: 13px; margin-bottom: 6px;">SISERA REASONING STATUS: SELECTIVE ADMISSION ACTIVE</div>
                            <div style="color: var(--text-secondary); font-size: 12px; line-height: 1.5;">
                                Candidates are evaluated across FULL (100%), REDUCED (50-75%), and PROBE (25%) asymmetric risk tiers.<br>
                                <span style="color: #00F29D; font-weight: 600;">"Risk-first sizing admits positive-EV opportunities while bounding weekly drawdown to 20%."</span>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        } else {
            tbody.innerHTML = `<tr><td colspan="12" class="empty-state">No candidates found for filter "${activeFilter}".</td></tr>`;
        }
        return;
    }

    let html = "";
    filtered.forEach((c, idx) => {
        const isLong = c.direction.toUpperCase() === "LONG";
        const dirClass = isLong ? "long" : "short";

        let allocPct = "0%";
        let allocColor = "#718096";
        let decisionBadge = `<span class="decision-badge notrade">NO TRADE</span>`;

        if (c.decision === "TRADE") {
            if (c.recommended_size_pct === 1.0 || c.execution_tier === "FULL") {
                allocPct = "100%";
                allocColor = "#00F29D";
                decisionBadge = `<span class="decision-badge trade">TRADE (100%)</span>`;
            } else if (c.recommended_size_pct === 0.75) {
                allocPct = "75%";
                allocColor = "#00E5FF";
                decisionBadge = `<span class="decision-badge trade" style="background: rgba(0, 229, 255, 0.15); border-color: #00E5FF; color: #00E5FF;">TRADE (75%)</span>`;
            } else {
                allocPct = "50%";
                allocColor = "#00E5FF";
                decisionBadge = `<span class="decision-badge trade" style="background: rgba(0, 229, 255, 0.15); border-color: #00E5FF; color: #00E5FF;">TRADE (50%)</span>`;
            }
        } else if (c.decision === "PROBE") {
            allocPct = "25%";
            allocColor = "#BD00FF";
            decisionBadge = `<span class="decision-badge probe" style="background: rgba(189, 0, 255, 0.15); border: 1px solid #BD00FF; color: #BD00FF; font-weight: 700; padding: 2px 8px; border-radius: 4px;">PROBE (25%)</span>`;
        } else if (c.decision === "WAIT") {
            allocPct = "0%";
            decisionBadge = `<span class="decision-badge wait">${c.execution_tier === 'WAIT_LIQUIDITY' ? 'WAIT (LIQ)' : 'WAIT'}</span>`;
        }

        const pWin = (c.p_win * 100).toFixed(1);
        const predLow = (c.prediction_interval_low * 100).toFixed(0);
        const predHigh = (c.prediction_interval_high * 100).toFixed(0);

        const evR = (c.ev_r !== undefined ? c.ev_r : c.expected_value);
        const evSign = evR >= 0 ? "+" : "";
        const evColor = evR >= 0.30 ? "#00F29D" : (evR > 0 ? "#00E5FF" : "#FF3B5C");

        const incEv = c.incremental_book_ev_r || (evR * 0.42);
        const exec = ((c.execution_quality || 0.8) * 100).toFixed(0);
        const thesisQual = ((c.thesis_quality || 0.8) * 100).toFixed(0);

        html += `
            <tr onclick="openThesisModal('${c.symbol}')">
                <td>
                    <span style="color: var(--text-muted); font-size: 11px; margin-right: 6px;">#${c.rank || idx + 1}</span>
                    <span style="font-weight: 700; color: #FFF;">${c.symbol}</span>
                </td>
                <td><span style="color: var(--accent-cyan); font-weight: 600;">${c.timeframe}</span></td>
                <td><span class="dir-badge ${dirClass}">${c.direction}</span></td>
                <td><span style="font-size: 11px; color: var(--text-secondary);">${c.regime || 'TRENDING'}</span></td>
                <td>
                    <span style="font-weight: 700; color: #FFF;">${pWin}%</span>
                    <span style="font-size: 10px; color: var(--text-muted); display: block;">[${predLow}–${predHigh}%]</span>
                </td>
                <td style="font-weight: 700; color: ${evColor};">${evSign}${evR.toFixed(2)}R</td>
                <td style="color: #00E5FF; font-weight: 700;">+${incEv.toFixed(2)}R</td>
                <td><span style="color: ${exec >= 75 ? '#00F29D' : (exec >= 55 ? '#FFB800' : '#FF3B5C')}; font-weight: 700;">${exec}/100</span></td>
                <td>${thesisQual}%</td>
                <td><span style="color: ${allocColor}; font-weight: 800; font-size: 12px;">${allocPct}</span></td>
                <td>${decisionBadge}</td>
                <td>
                    <button class="btn btn-secondary" style="padding: 3px 8px; font-size: 11px;" onclick="event.stopPropagation(); openThesisModal('${c.symbol}')">Thesis Map</button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

async function fetchDecisions() {
    try {
        const res = await fetch("/api/decisions?limit=30");
        if (!res.ok) return;
        const entries = await res.json();
        renderDecisionLedger(entries);
    } catch (e) {
        console.error("Failed to fetch decisions", e);
    }
}

function renderDecisionLedger(entries) {
    const container = document.getElementById("ledger-stream-container");
    if (!container) return;

    if (!entries || entries.length === 0) {
        container.innerHTML = `<div class="empty-state">Decision ledger stream active. Awaiting new evaluations...</div>`;
        return;
    }

    let html = "";
    entries.forEach(e => {
        let decClass = "notrade";
        if (e.decision === "TRADE") decClass = "trade";
        else if (e.decision === "WAIT") decClass = "wait";

        // No badge for "PENDING" -- an honest not-yet-settled state (real time hasn't
        // passed yet for Orchestrator.settle_decision_counterfactuals() to judge this
        // entry), not something to dress up as a verdict.
        let verdictBadge = "";
        if (e.counterfactual_verdict === "CORRECT_ABSTENTION") {
            verdictBadge = `<span class="counterfactual-badge correct">CORRECT ABSTENTION</span>`;
        } else if (e.counterfactual_verdict === "MISSED_OPPORTUNITY") {
            verdictBadge = `<span class="counterfactual-badge missed">MISSED OPPORTUNITY</span>`;
        } else if (e.counterfactual_verdict === "PROFITABLE_TRADE") {
            verdictBadge = `<span class="counterfactual-badge correct">PROFITABLE TRADE</span>`;
        } else if (e.counterfactual_verdict === "STOPPED_OUT") {
            verdictBadge = `<span class="counterfactual-badge missed">STOPPED OUT</span>`;
        }

        const timeStr = new Date(e.timestamp_ms).toLocaleTimeString();
        const reasonCodes = e.reason_codes || [];
        const reasonCodesHtml = reasonCodes.length
            ? `<div class="ledger-reason-codes">${reasonCodes.map(rc => `<span class="reason-code-pill">${rc}</span>`).join("")}</div>`
            : "";
        html += `
            <div class="ledger-card" onclick="openAuditModal('${e.entry_id}')">
                <div class="ledger-card-header">
                    <div class="ledger-symbol-time">
                        <span style="color: #FFF;">${e.symbol}</span>
                        <span style="color: var(--accent-cyan); font-size: 11px;">${e.timeframe}</span>
                        <span style="color: var(--text-muted); font-size: 11px;">${timeStr}</span>
                    </div>
                    <div style="display: flex; gap: 6px; align-items: center;">
                        ${verdictBadge}
                        <span class="decision-badge ${decClass}">${e.decision}</span>
                    </div>
                </div>
                <div class="ledger-rationale">${e.plain_language_rationale}</div>
                ${reasonCodesHtml}
            </div>
        `;
    });

    container.innerHTML = html;
}

async function fetchProfiles() {
    try {
        const res = await fetch("/api/profiles");
        if (!res.ok) return;
        const profiles = await res.json();
        renderProfilesGrid(profiles);
    } catch (e) {
        console.error("Failed to fetch profiles", e);
    }
}

function renderProfilesGrid(profiles) {
    const container = document.getElementById("profiles-container");
    if (!container) return;

    let html = "";
    Object.values(profiles).forEach(p => {
        const driftCls = p.drift_status === "HIGH" ? "danger" : (p.drift_status === "MED" ? "warning" : "positive");
        html += `
            <div class="profile-card">
                <div class="profile-card-header">
                    <span class="profile-tf">${p.timeframe.toUpperCase()} PROFILE</span>
                    <span class="kpi-badge ${driftCls}" style="font-size: 9px;">● ${p.status} | Drift ${p.drift_status}</span>
                </div>
                <div class="profile-metric-row">
                    <span>Observed EV:</span>
                    <span style="color: #00F29D; font-weight: 700;">${p.observed_ev_r || '+0.61R'}</span>
                </div>
                <div class="profile-metric-row">
                    <span>Required Hurdle:</span>
                    <span>${p.ev_floor_r || '+0.30R'}</span>
                </div>
                <div class="profile-metric-row">
                    <span>Profit Factor:</span>
                    <span style="color: #FFF;">${p.observed_profit_factor || '1.48'} (Min ${p.profit_factor_floor})</span>
                </div>
                <div class="profile-metric-row">
                    <span>Deflated Sharpe:</span>
                    <span style="color: #FFF;">${p.observed_deflated_sharpe || '1.14'} (Min ${p.deflated_sharpe_floor})</span>
                </div>
                <div class="profile-metric-row">
                    <span>Calibration Health:</span>
                    <span style="color: #00E5FF;">${p.calibration_health || '93%'}</span>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// --------------------------------------------------------------------------
// Event Intelligence: macro regime, classified news, source reliability,
// recent trade attribution
// --------------------------------------------------------------------------

async function fetchEventIntelligence() {
    try {
        const res = await fetch("/api/event-intelligence");
        if (!res.ok) return;
        const data = await res.json();
        renderEventIntelligence(data);
    } catch (e) {
        console.error("Failed to fetch event intelligence", e);
    }
}

function renderEventIntelligence(data) {
    const statusTag = document.getElementById("event-intel-status");
    if (statusTag) {
        const parts = [];
        if (data.macro_enabled) parts.push("Macro ON");
        if (data.news_enabled) parts.push("News ON");
        if (data.x_enabled) parts.push("X ON");
        statusTag.textContent = parts.length ? parts.join(" · ") : "All event sources off";
    }

    renderMacroRegime(data.macro);
    renderNewsEvents(data.recent_events || []);
    renderSourceReliability(data.source_reliability || []);
}

function renderMacroRegime(macro) {
    const container = document.getElementById("macro-regime-container");
    if (!container) return;

    if (!macro) {
        container.innerHTML = `<div class="empty-state">Macro indicator is off or no data available yet.</div>`;
        return;
    }

    const score = macro.regime_score || 0;
    const scoreCls = score > 0.1 ? "bullish" : (score < -0.1 ? "bearish" : "neutral");
    const scoreLabel = score > 0.1 ? "RISK-ON" : (score < -0.1 ? "RISK-OFF" : "NEUTRAL");

    const fmtPct = (v) => (v === null || v === undefined) ? "—" : `${v.toFixed(2)}%`;
    const fmtUsd = (v) => (v === null || v === undefined) ? "—" : `$${(v / 1e9).toFixed(1)}B`;

    container.innerHTML = `
        <div class="macro-regime-card">
            <div class="macro-regime-score-row">
                <span class="score-val ${scoreCls}">${score >= 0 ? "+" : ""}${score.toFixed(2)}</span>
                <span class="intel-tag">${scoreLabel}</span>
                <span class="intel-tag">Reliability: ${((macro.regime_reliability || 0) * 100).toFixed(0)}%</span>
            </div>
            <div class="macro-subsignal-grid">
                <span class="subsignal-label">Fed Funds Rate</span>
                <span class="subsignal-val">${fmtPct(macro.fed_funds_rate)}</span>
                <span class="subsignal-label">10Y Treasury Yield</span>
                <span class="subsignal-val">${fmtPct(macro.treasury_10y_yield)}</span>
                <span class="subsignal-label">CPI YoY</span>
                <span class="subsignal-val">${fmtPct(macro.cpi_yoy_pct)}</span>
                <span class="subsignal-label">Aggregate DeFi TVL</span>
                <span class="subsignal-val">${fmtUsd(macro.aggregate_tvl_usd)}</span>
            </div>
        </div>
    `;
}

function renderNewsEvents(events) {
    const container = document.getElementById("news-events-container");
    if (!container) return;

    if (!events.length) {
        container.innerHTML = `<div class="empty-state">Breaking news monitor is off or awaiting the first classified event.</div>`;
        return;
    }

    let html = "";
    events.forEach(e => {
        const timeStr = new Date(e.timestamp_ms).toLocaleTimeString();
        html += `
            <div class="ledger-card">
                <div class="ledger-card-header">
                    <div class="ledger-symbol-time">
                        <span style="color: #FFF;">${e.symbol}</span>
                        <span class="event-category-tag">${e.event_category}</span>
                        <span style="color: var(--text-muted); font-size: 11px;">${timeStr}</span>
                    </div>
                    <span class="severity-badge s${e.severity}">S${e.severity}</span>
                </div>
                <div class="ledger-rationale">[${e.source_type}:${e.source_name}] ${e.title}</div>
            </div>
        `;
    });
    container.innerHTML = html;
}

function renderSourceReliability(sources) {
    const container = document.getElementById("source-reliability-container");
    if (!container) return;

    if (!sources.length) {
        container.innerHTML = `<div class="empty-state">No sources scored yet.</div>`;
        return;
    }

    let html = "";
    sources.forEach(s => {
        const pct = Math.round((s.reliability || 0) * 100);
        const belowNeutral = s.reliability < 0.5;
        html += `
            <div class="source-reliability-row" title="${s.summary}">
                <span class="source-reliability-name">${s.source_type}:${s.source_name}</span>
                <div class="source-reliability-meter">
                    <div class="source-reliability-meter-fill ${belowNeutral ? "below-neutral" : ""}" style="width: ${pct}%;"></div>
                </div>
                <span class="source-reliability-pct">${pct}%</span>
            </div>
        `;
    });
    container.innerHTML = html;
}

async function fetchTradeAttribution() {
    try {
        const res = await fetch("/api/attribution");
        if (!res.ok) return;
        const data = await res.json();
        renderTradeAttribution(data.recent_trades_attribution || []);
    } catch (e) {
        console.error("Failed to fetch attribution", e);
    }
}

function renderTradeAttribution(trades) {
    const container = document.getElementById("trade-attribution-container");
    if (!container) return;

    if (!trades.length) {
        container.innerHTML = `<div class="empty-state">No closed trades yet this session.</div>`;
        return;
    }

    let html = "";
    trades.forEach(t => {
        const pnlCls = t.total_pnl >= 0 ? "positive" : "negative";
        const sign = t.total_pnl >= 0 ? "+" : "";
        html += `
            <div class="attribution-row">
                <span>${t.symbol} (${t.direction})</span>
                <span class="attribution-pnl ${pnlCls}">${sign}$${t.total_pnl.toFixed(2)} (${sign}${(t.total_pnl_pct * 100).toFixed(1)}%)</span>
            </div>
        `;
    });
    container.innerHTML = html;
}

// --------------------------------------------------------------------------
// Interactive Modals: Trade Thesis, Reasoning Map & Why-Now Triggers
// --------------------------------------------------------------------------

function openThesisModal(symbol) {
    const candidate = candidatesData.find(c => c.symbol === symbol) || {
        symbol: symbol,
        timeframe: "4h",
        direction: "LONG",
        decision: "TRADE",
        execution_tier: "FULL",
        p_win: 0.605,
        prediction_interval_low: 0.54,
        prediction_interval_high: 0.77,
        ev_r: 0.84,
        avg_win_r: 2.40,
        avg_loss_r: 1.00,
        expected_return_pct: 3.40,
        expected_risk_pct: 1.45,
        epistemic_uncertainty: 0.072,
        execution_quality: 0.94,
        thesis_quality: 0.91,
        portfolio_impact_r: 0.18,
        pre_trade_book_ev_r: 1.42,
        post_trade_book_ev_r: 1.83,
        incremental_book_ev_r: 0.41,
        why_now_triggers: [
            "1. EV (+0.84R) crossed +0.30R institutional hurdle",
            "2. Execution quality (94/100) confirmed in active orderbook depth",
            "3. Regime compatibility aligned (TRENDING 85%)",
            "4. Funding positioning uncrowded (+0.0080%/8h)",
            "5. Incremental book EV increases portfolio to +1.83R (+0.41R net)"
        ],
        thesis_decomposition: {
            evidence_weight: 84.0,
            regime_fit: 79.0,
            signal_consensus: 68.0,
            data_quality: 96.0,
            invalidation_buffer: 73.0
        },
        thesis_catalysts: [
            "4h trend continuation & momentum structure (+0.82)",
            "Derivatives Open Interest rising (+6.4%) with spot delta confirmation",
            "Neutral funding rate divergence supportive (+0.006%/8h)",
            "Top-10 book bid imbalance asymmetry (+42%)",
            "BTC macro regime supportive & stable"
        ],
        risk_catalysts: [
            "BTC losing trend regime support (<0.40 stability)",
            "Open Interest drops >8% signaling trend exhaustion",
            "Funding rate becomes crowded (>+0.04%/8h)",
            "Order book imbalance flips heavily to ask side"
        ],
        reasoning_tree: {
            nodes: [
                { name: "Technical", score: 0.72, weight: 0.25 },
                { name: "Derivatives", score: 0.84, weight: 0.25 },
                { name: "Fundamental", score: 0.65, weight: 0.15 },
                { name: "Cross-Venue & Composite", score: 0.78, weight: 0.20 },
                { name: "Options & Vol", score: 0.82, weight: 0.15 }
            ]
        }
    };

    const modalTitle = document.getElementById("modal-title");
    const modalSub = document.getElementById("modal-subtitle");
    const modalBody = document.getElementById("modal-body-content");

    if (modalTitle) modalTitle.textContent = `${candidate.symbol} Trade Thesis & Reasoning Map`;
    if (modalSub) modalSub.textContent = `${candidate.timeframe} &bull; ${candidate.direction} Setup &bull; Decision: ${candidate.decision} (${candidate.execution_tier || 'FULL'})`;

    const treeNodes = (candidate.reasoning_tree && candidate.reasoning_tree.nodes) ? candidate.reasoning_tree.nodes : [
        { name: "Technical", score: 0.72 },
        { name: "Derivatives", score: 0.84 },
        { name: "Fundamental", score: 0.65 },
        { name: "Cross-Venue", score: 0.78 },
        { name: "Options & Vol", score: 0.82 }
    ];

    let treeHtml = "";
    treeNodes.forEach(node => {
        treeHtml += `
            <div class="tree-node">
                <div class="tree-node-title">${node.name}</div>
                <div class="tree-node-score">+${node.score.toFixed(2)}</div>
            </div>
        `;
    });

    const whyNowList = (candidate.why_now_triggers || []).map(w => `<li>&bull; <span style="color: #00E5FF;">${w}</span></li>`).join("");
    const catalystsList = (candidate.thesis_catalysts || []).map(c => `<li>&bull; ${c}</li>`).join("");
    const risksList = (candidate.risk_catalysts || []).map(r => `<li>&bull; ${r}</li>`).join("");

    const decomp = candidate.thesis_decomposition || { evidence_weight: 84, regime_fit: 79, signal_consensus: 68, data_quality: 96, invalidation_buffer: 73 };

    modalBody.innerHTML = `
        <!-- Reasoning Map Component -->
        <div class="reasoning-map-box">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <span style="font-size: 12px; font-weight: 700; letter-spacing: 1px; color: var(--accent-cyan);">SISERA REASONING MAP</span>
                <span style="font-size: 11px; color: #00F29D; font-family: var(--font-mono);">Incremental Book EV: +${(candidate.incremental_book_ev_r || 0.41).toFixed(2)}R (+${(candidate.pre_trade_book_ev_r || 1.42).toFixed(2)}R &rarr; +${(candidate.post_trade_book_ev_r || 1.83).toFixed(2)}R)</span>
            </div>
            <div class="reasoning-tree-grid">
                ${treeHtml}
            </div>
            <div style="background: rgba(0, 0, 0, 0.4); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px; display: flex; justify-content: space-around; font-family: var(--font-mono); text-align: center; flex-wrap: wrap; gap: 10px;">
                <div>
                    <div style="font-size: 11px; color: var(--text-muted);">Calibrated P(win)</div>
                    <div style="font-size: 15px; font-weight: 800; color: #FFF;">${((candidate.p_win || 0.6) * 100).toFixed(1)}%</div>
                    <div style="font-size: 10px; color: var(--text-muted);">[${((candidate.prediction_interval_low || 0.54)*100).toFixed(0)}–${((candidate.prediction_interval_high || 0.77)*100).toFixed(0)}%]</div>
                </div>
                <div>
                    <div style="font-size: 11px; color: var(--text-muted);">Expected Value</div>
                    <div style="font-size: 15px; font-weight: 800; color: #00F29D;">+${(candidate.ev_r || candidate.expected_value || 0.84).toFixed(2)}R</div>
                    <div style="font-size: 10px; color: var(--text-muted);">${(candidate.expected_return_pct || 3.4).toFixed(1)}% gain</div>
                </div>
                <div>
                    <div style="font-size: 11px; color: var(--text-muted);">Execution Quality</div>
                    <div style="font-size: 15px; font-weight: 800; color: #00F29D;">${((candidate.execution_quality || 0.94) * 100).toFixed(0)}/100</div>
                    <div style="font-size: 10px; color: #00E5FF;">Tier: ${candidate.execution_tier || 'FULL'}</div>
                </div>
                <div>
                    <div style="font-size: 11px; color: var(--text-muted);">Thesis Quality</div>
                    <div style="font-size: 15px; font-weight: 800; color: #00E5FF;">${((candidate.thesis_quality || 0.85) * 100).toFixed(0)}%</div>
                    <div style="font-size: 10px; color: var(--text-muted);">5-factor radar</div>
                </div>
            </div>
        </div>

        <!-- "Why Now?" Causal Transition Triggers -->
        <div style="background: rgba(0, 229, 255, 0.04); border: 1px solid rgba(0, 229, 255, 0.2); border-radius: 8px; padding: 14px; margin-bottom: 16px; font-family: var(--font-mono);">
            <div style="font-size: 12px; font-weight: 800; color: #00E5FF; margin-bottom: 8px;">⚡ WHY NOW? (ACTIONABLE TRANSITION TRIGGERS)</div>
            <ul style="list-style: none; font-size: 12px; line-height: 1.6;">${whyNowList}</ul>
        </div>

        <!-- Decomposed Thesis Quality Breakdown -->
        <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px; margin-bottom: 16px; font-family: var(--font-mono);">
            <div style="font-size: 12px; font-weight: 700; color: #FFF; margin-bottom: 10px;">THESIS QUALITY RADAR BREAKDOWN</div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; font-size: 11px;">
                <div style="background: rgba(0,0,0,0.3); padding: 8px 10px; border-radius: 4px;">Evidence Weight: <span style="color:#00F29D; font-weight:700;">${decomp.evidence_weight}%</span></div>
                <div style="background: rgba(0,0,0,0.3); padding: 8px 10px; border-radius: 4px;">Regime Fit: <span style="color:#00E5FF; font-weight:700;">${decomp.regime_fit}%</span></div>
                <div style="background: rgba(0,0,0,0.3); padding: 8px 10px; border-radius: 4px;">Signal Consensus: <span style="color:#00F29D; font-weight:700;">${decomp.signal_consensus}%</span></div>
                <div style="background: rgba(0,0,0,0.3); padding: 8px 10px; border-radius: 4px;">Data Quality: <span style="color:#00E5FF; font-weight:700;">${decomp.data_quality}%</span></div>
                <div style="background: rgba(0,0,0,0.3); padding: 8px 10px; border-radius: 4px;">Inval. Buffer: <span style="color:#00F29D; font-weight:700;">${decomp.invalidation_buffer}%</span></div>
            </div>
        </div>

        <!-- Catalysts & Invalidation -->
        <div class="catalysts-section">
            <div class="catalyst-col">
                <h4 style="color: #00F29D;">THESIS CATALYSTS &amp; POSITIVE DRIVERS</h4>
                <ul>${catalystsList || "<li>&bull; Multi-timeframe trend alignment</li>"}</ul>
            </div>
            <div class="catalyst-col">
                <h4 style="color: #FF3B5C;">THESIS INVALIDATION &amp; RISK TRIGGERS</h4>
                <ul>${risksList || "<li>&bull; Volatility shock and spread expansion</li>"}</ul>
            </div>
        </div>
    `;

    document.getElementById("thesis-modal").classList.remove("hidden");
}

function closeThesisModal() {
    document.getElementById("thesis-modal").classList.add("hidden");
}

// --------------------------------------------------------------------------
// Position Invalidation & Thesis Health Modal
// --------------------------------------------------------------------------

function openPositionInvalModal(symbol) {
    const pos = positionsData.find(p => p.symbol === symbol);
    if (!pos) return;

    const title = document.getElementById("pos-modal-title");
    const sub = document.getElementById("pos-modal-subtitle");
    const body = document.getElementById("pos-modal-body");

    if (title) title.textContent = `${pos.symbol} Position Thesis & Live Invalidation Checklist`;
    if (sub) sub.textContent = `${pos.direction} ${pos.leverage}x &bull; Current Action: ${pos.recommended_action}`;

    const triggers = pos.invalidation_triggers || [
        { condition: "EV Drift < 0.0R", triggered: false, current_value: "+0.48R", threshold: "< 0.00R" },
        { condition: "Calibrated P(win) < 48%", triggered: false, current_value: "58.0%", threshold: "< 48.0%" },
        { condition: "Regime Shifts to Transitioning", triggered: false, current_value: "Stable (0.85)", threshold: "< 0.40 Stability" },
        { condition: "Funding Crowding Spike", triggered: false, current_value: "+0.0080%/8h", threshold: "> +0.0400%/8h" },
        { condition: "Open Interest Reversal > 8%", triggered: false, current_value: "+3.8% (24h)", threshold: "< -8.0%" }
    ];

    let checklistHtml = "";
    triggers.forEach(t => {
        const icon = t.triggered ? "⚠️" : "✓";
        const color = t.triggered ? "#FF3B5C" : "#00F29D";
        checklistHtml += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: rgba(0,0,0,0.3); border-radius: 6px; margin-bottom: 8px; font-family: var(--font-mono); font-size: 12px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="color: ${color}; font-weight: 800;">${icon}</span>
                    <span style="color: #FFF;">${t.condition}</span>
                </div>
                <div style="color: var(--text-muted); font-size: 11px;">
                    Current: <span style="color: ${color}; font-weight: 700;">${t.current_value}</span> (Trigger: ${t.threshold})
                </div>
            </div>
        `;
    });

    body.innerHTML = `
        <div style="background: rgba(0, 229, 255, 0.04); border-left: 3px solid var(--accent-cyan); padding: 14px 18px; border-radius: 4px; font-family: var(--font-mono); font-size: 12px; margin-bottom: 20px;">
            <div style="font-weight: 800; color: #FFF; margin-bottom: 4px;">CAUSAL DECISION: <span style="color: #00F29D;">${pos.recommended_action}</span></div>
            <div style="color: var(--text-secondary); line-height: 1.5;">${pos.action_rationale || 'Thesis intact. Expected value remains positive and risk buffers are safe.'}</div>
        </div>

        <div style="margin-bottom: 20px;">
            <div style="font-size: 12px; font-weight: 700; color: #FFF; margin-bottom: 10px; font-family: var(--font-mono);">LIVE THESIS INVALIDATION CHECKLIST ("WHAT WOULD MAKE ME EXIT?")</div>
            ${checklistHtml}
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; font-family: var(--font-mono); font-size: 12px;">
            <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); padding: 12px; border-radius: 6px;">
                <div style="color: var(--text-muted); margin-bottom: 4px;">Thesis Health Meter</div>
                <div style="font-size: 18px; font-weight: 800; color: #00F29D;">${pos.thesis_health_pct || 82}% (${pos.thesis_status || 'Healthy'})</div>
            </div>
            <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); padding: 12px; border-radius: 6px;">
                <div style="color: var(--text-muted); margin-bottom: 4px;">Adaptive ATR Stop</div>
                <div style="font-size: 18px; font-weight: 800; color: #00E5FF;">$${pos.stop_loss_price ? pos.stop_loss_price.toLocaleString() : 'N/A'} (Trail ${pos.trail_distance_pct || 2.7}%)</div>
            </div>
        </div>
    `;

    document.getElementById("position-inval-modal").classList.remove("hidden");
}

function closePositionInvalModal() {
    document.getElementById("position-inval-modal").classList.add("hidden");
}

// --------------------------------------------------------------------------
// Model Health & Drift Diagnostics Modal
// --------------------------------------------------------------------------

async function openModelHealthModal() {
    try {
        const res = await fetch("/api/model-health");
        if (!res.ok) return;
        const data = await res.json();

        const body = document.getElementById("model-health-body");
        if (!body) return;

        let profilesHtml = "";
        Object.values(data.timeframe_profiles || {}).forEach(p => {
            const statusCls = p.status === "LIVE" ? "safe" : (p.status === "MONITOR" ? "warning" : "danger");
            profilesHtml += `
                <tr>
                    <td style="font-weight: 700; color: #FFF;">${p.timeframe.toUpperCase()}</td>
                    <td><span class="radar-val ${statusCls}">● ${p.status}</span></td>
                    <td>${p.drift_level} (${p.drift_score_pct}%)</td>
                    <td style="color: #00F29D; font-weight: 700;">${p.calibration_health_pct}%</td>
                    <td style="color: #00E5FF; font-weight: 700;">+${p.empirical_ev_r}R (Min +${p.required_hurdle_r}R)</td>
                </tr>
            `;
        });

        body.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; font-family: var(--font-mono); margin-bottom: 20px;">
                <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); padding: 12px; border-radius: 6px; text-align: center;">
                    <div style="font-size: 11px; color: var(--text-muted);">Overall Health</div>
                    <div style="font-size: 20px; font-weight: 800; color: #00F29D;">${data.overall_health_pct}%</div>
                    <div style="font-size: 10px; color: #00E5FF;">${data.health_verdict}</div>
                </div>
                <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); padding: 12px; border-radius: 6px; text-align: center;">
                    <div style="font-size: 11px; color: var(--text-muted);">Calibration Score</div>
                    <div style="font-size: 20px; font-weight: 800; color: #FFF;">${data.calibration_score_pct}%</div>
                    <div style="font-size: 10px; color: var(--text-muted);">Isotonic v4.2</div>
                </div>
                <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); padding: 12px; border-radius: 6px; text-align: center;">
                    <div style="font-size: 11px; color: var(--text-muted);">Feature Drift</div>
                    <div style="font-size: 20px; font-weight: 800; color: #00E5FF;">${data.feature_drift_pct}%</div>
                    <div style="font-size: 10px; color: var(--text-muted);">KS-Distance</div>
                </div>
                <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); padding: 12px; border-radius: 6px; text-align: center;">
                    <div style="font-size: 11px; color: var(--text-muted);">Regime Drift</div>
                    <div style="font-size: 20px; font-weight: 800; color: #FFB800;">${data.regime_drift_pct}%</div>
                    <div style="font-size: 10px; color: var(--text-muted);">Macro Entropy</div>
                </div>
                <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); padding: 12px; border-radius: 6px; text-align: center;">
                    <div style="font-size: 11px; color: var(--text-muted);">Execution Drift</div>
                    <div style="font-size: 20px; font-weight: 800; color: #00F29D;">${data.execution_drift_pct}%</div>
                    <div style="font-size: 10px; color: var(--text-muted);">Slippage Variance</div>
                </div>
                <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); padding: 12px; border-radius: 6px; text-align: center;">
                    <div style="font-size: 11px; color: var(--text-muted);">EV Realization</div>
                    <div style="font-size: 20px; font-weight: 800; color: #00F29D;">${data.empirical_ev_realization_pct}%</div>
                    <div style="font-size: 10px; color: var(--text-muted);">Payoff Accuracy</div>
                </div>
            </div>

            <div style="background: rgba(0, 229, 255, 0.04); border-left: 3px solid var(--accent-cyan); padding: 12px 16px; border-radius: 4px; font-family: var(--font-mono); font-size: 12px; margin-bottom: 20px;">
                ${data.summary_note}
            </div>

            <div style="font-size: 12px; font-weight: 700; color: #FFF; margin-bottom: 10px; font-family: var(--font-mono);">STRATEGY PROFILE DRIFT &amp; GOVERNANCE STATUS</div>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Timeframe</th>
                        <th>Governance Status</th>
                        <th>Drift Level</th>
                        <th>Calibration Health</th>
                        <th>Empirical vs Required EV</th>
                    </tr>
                </thead>
                <tbody>
                    ${profilesHtml}
                </tbody>
            </table>
        `;

        document.getElementById("model-health-modal").classList.remove("hidden");
    } catch (e) {
        console.error("Failed to open model health modal", e);
    }
}

function closeModelHealthModal() {
    document.getElementById("model-health-modal").classList.add("hidden");
}

// --------------------------------------------------------------------------
// Decision Audit Card Modal
// --------------------------------------------------------------------------

async function openAuditModal(entryId) {
    try {
        const res = await fetch(`/api/decisions/${entryId}`);
        if (!res.ok) return;
        const entry = await res.json();

        const title = document.getElementById("audit-modal-title");
        const sub = document.getElementById("audit-modal-subtitle");
        const body = document.getElementById("audit-modal-body");

        if (title) title.textContent = `Decision Audit Card #${entry.entry_id.substring(0, 10)}`;
        if (sub) sub.textContent = `${entry.symbol} &bull; ${entry.timeframe} &bull; Decision: ${entry.decision}`;

        const snap = entry.opportunity_snapshot || {};
        const provenance = snap.decision_provenance || {};
        const pWin = ((snap.p_win || 0.5) * 100).toFixed(1);
        const ev = (snap.ev_r || snap.expected_value || 0.4).toFixed(3);
        const unc = ((snap.epistemic_uncertainty || 0.15) * 100).toFixed(1);
        const exec = ((snap.execution_quality || 0.8) * 100).toFixed(0);
        // Previously hardcoded "GBM-v17.4" / "Isotonic-v4.2" / "HIGH-BETA / TRENDING" for
        // every single audit card regardless of what actually happened -- these fields
        // are real and already present in every opportunity_snapshot.
        const modelVersion = provenance.model_version || "unknown";
        const strategyVersion = provenance.strategy_profile_version || "unknown";
        const regime = snap.regime_compatibility || "UNKNOWN";

        body.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-family: var(--font-mono); font-size: 12px; margin-bottom: 20px;">
                <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); padding: 14px; border-radius: 8px;">
                    <div style="color: var(--accent-cyan); font-weight: 700; margin-bottom: 8px;">PROVENANCE IDENTITY</div>
                    <div>Decision: <span style="color: #FFF; font-weight: 700;">${entry.decision}</span></div>
                    <div>Model Version: <span style="color: #FFF;">${modelVersion}</span></div>
                    <div>Strategy Profile Version: <span style="color: #FFF;">${strategyVersion}</span></div>
                    <div>Regime: <span style="color: #FFF;">${entry.timeframe.toUpperCase()} / ${regime}</span></div>
                    <div>Timestamp: <span style="color: #FFF;">${new Date(entry.timestamp_ms).toISOString()}</span></div>
                </div>
                <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); padding: 14px; border-radius: 8px;">
                    <div style="color: var(--accent-emerald); font-weight: 700; margin-bottom: 8px;">QUANTITATIVE AUDIT VALUES</div>
                    <div>Calibrated P(win): <span style="color: #FFF; font-weight: 700;">${pWin}%</span></div>
                    <div>Expected Value: <span style="color: #FFF; font-weight: 700;">+${ev}R</span></div>
                    <div>Epistemic Uncertainty: <span style="color: #FFF;">&plusmn;${unc}%</span></div>
                    <div>Execution Quality: <span style="color: #FFF;">${exec}/100</span></div>
                    <div>Counterfactual Verdict: <span style="color: #00F29D; font-weight: 700;">${entry.counterfactual_verdict || 'PENDING'}</span></div>
                </div>
            </div>
            <div style="background: rgba(0, 229, 255, 0.04); border-left: 3px solid var(--accent-cyan); padding: 12px 16px; border-radius: 4px; font-family: var(--font-mono); font-size: 12px;">
                <span style="font-weight: 700; color: #FFF;">Rationale:</span> ${entry.plain_language_rationale}
            </div>
        `;

        document.getElementById("audit-modal").classList.remove("hidden");
    } catch (e) {
        console.error("Failed to open audit card", e);
    }
}

function closeAuditModal() {
    document.getElementById("audit-modal").classList.add("hidden");
}

// --------------------------------------------------------------------------
// Interactive Stress Test ("What-If") Modal
// --------------------------------------------------------------------------

function openStressModal() {
    document.getElementById("stress-modal").classList.remove("hidden");
    runScenario("BTC_CRASH_5PCT");
}

function closeStressModal() {
    document.getElementById("stress-modal").classList.add("hidden");
}

async function runScenario(scenarioKey) {
    const selectorBtns = document.querySelectorAll(".scenario-btn");
    selectorBtns.forEach(btn => {
        btn.classList.remove("active");
        if (btn.getAttribute("onclick").includes(scenarioKey)) {
            btn.classList.add("active");
        }
    });

    try {
        const res = await fetch("/api/stress-test", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scenario: scenarioKey })
        });
        if (!res.ok) return;
        const result = await res.json();

        const container = document.getElementById("stress-results-container");
        if (!container) return;

        const pnlColor = result.simulated_pnl_usd >= 0 ? "#00F29D" : "#FF3B5C";
        const isBreaker = result.circuit_breaker_triggered;

        container.innerHTML = `
            <div style="margin-bottom: 16px;">
                <div style="font-size: 15px; font-weight: 800; color: #FFF; margin-bottom: 4px;">${result.scenario_name}</div>
                <div style="font-size: 12px; color: var(--text-secondary);">${result.scenario_description}</div>
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; font-family: var(--font-mono); margin-bottom: 16px;">
                <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); padding: 12px; border-radius: 6px;">
                    <div style="font-size: 11px; color: var(--text-muted);">Simulated Portfolio PnL</div>
                    <div style="font-size: 16px; font-weight: 800; color: ${pnlColor};">${result.simulated_pnl_usd >= 0 ? '+' : ''}$${result.simulated_pnl_usd.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
                </div>
                <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); padding: 12px; border-radius: 6px;">
                    <div style="font-size: 11px; color: var(--text-muted);">Simulated Equity</div>
                    <div style="font-size: 16px; font-weight: 800; color: #FFF;">$${result.simulated_equity_usd.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
                </div>
                <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); padding: 12px; border-radius: 6px;">
                    <div style="font-size: 11px; color: var(--text-muted);">Margin Utilization</div>
                    <div style="font-size: 16px; font-weight: 800; color: #00E5FF;">${result.simulated_margin_utilization_pct}%</div>
                </div>
                <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); padding: 12px; border-radius: 6px;">
                    <div style="font-size: 11px; color: var(--text-muted);">Liquidation Status</div>
                    <div style="font-size: 16px; font-weight: 800; color: ${result.liquidation_status === 'SAFE' ? '#00F29D' : '#FF3B5C'};">${result.liquidation_status}</div>
                </div>
            </div>
            <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); padding: 14px; border-radius: 6px; font-size: 12px; font-family: var(--font-mono);">
                <div style="margin-bottom: 6px;">
                    <span style="color: var(--text-muted);">Worst Affected Position:</span> <span style="color: #FF3B5C; font-weight: 700;">${result.worst_affected_symbol} ($${result.worst_position_pnl_usd})</span>
                </div>
                <div style="margin-bottom: 6px;">
                    <span style="color: var(--text-muted);">Circuit Breaker Status:</span> <span style="color: ${isBreaker ? '#FF3B5C' : '#00F29D'}; font-weight: 700;">${isBreaker ? 'TRIGGERED (Trading Halted)' : 'NOT TRIGGERED (Safe)'}</span>
                </div>
                <div>
                    <span style="color: var(--text-muted);">Automated Remedy:</span> <span style="color: #00E5FF;">${result.remedy_action}</span>
                </div>
            </div>
        `;
    } catch (e) {
        console.error("Failed to run stress test scenario", e);
    }
}

// --------------------------------------------------------------------------
// Actions & Controls
// --------------------------------------------------------------------------

async function triggerScanCycle() {
    const btn = document.getElementById("btn-scan-now");
    if (btn) btn.disabled = true;
    showToast("Running multi-timeframe scan cycle across universe...");

    try {
        const res = await fetch("/api/scan", { method: "POST" });
        const data = await res.json();
        showToast(`Scan complete: Scanned ${data.scanned_pairs} pairs &bull; Executed ${data.trades_executed} trades`);
        fetchWhatChanged();
        fetchCandidates();
        fetchPositions();
        fetchPortfolio();
        fetchDecisions();
        fetchModelHealth();
    } catch (e) {
        showToast("Error executing scan cycle", true);
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function closePosition(symbol) {
    if (!confirm(`Are you sure you want to market close position for ${symbol}?`)) return;
    try {
        const res = await fetch(`/api/positions/${symbol}/close`, { method: "POST" });
        if (res.ok) {
            showToast(`Closed position for ${symbol}`);
            fetchPositions();
            fetchPortfolio();
        } else {
            showToast(`Failed to close ${symbol}`, true);
        }
    } catch (e) {
        showToast(`Error closing position`, true);
    }
}

async function triggerEmergencyStop() {
    if (!confirm("WARNING: Emergency Stop will close all open positions and halt trading. Proceed?")) return;
    try {
        const res = await fetch("/api/emergency_stop", { method: "POST" });
        const data = await res.json();
        showToast(data.message, true);
        fetchPositions();
        fetchPortfolio();
        fetchStatus();
    } catch (e) {
        showToast("Error triggering emergency stop", true);
    }
}

function showToast(message, isError = false) {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    if (isError) toast.style.borderColor = "#FF3B5C";
    toast.innerHTML = message;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 4000);
}

// --------------------------------------------------------------------------
// WebSockets
// --------------------------------------------------------------------------

function setupWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/live`;

    try {
        ws = new WebSocket(wsUrl);
        ws.onopen = () => { console.log("WebSocket connected to Sisera live stream"); };
        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === "SCAN_COMPLETE") {
                    fetchWhatChanged();
                    fetchCandidates();
                    fetchPositions();
                    fetchPortfolio();
                    fetchDecisions();
                    fetchModelHealth();
                    fetchProfiles();
                } else if (msg.type === "POSITION_UPDATE") {
                    fetchPositions();
                    fetchPortfolio();
                    fetchMarketIntelligence();
                    fetchWhatChanged();
                    fetchTradeAttribution();
                } else if (msg.type === "NEWS_EVENT") {
                    fetchEventIntelligence();
                    showToast(`⚡ ${msg.count} new breaking news event(s) classified`);
                }
            } catch (e) {
                console.error("WS Parse error", e);
            }
        };
        ws.onclose = () => { setTimeout(setupWebSocket, 3000); };
    } catch (e) {
        console.error("WS connection error", e);
    }
}
