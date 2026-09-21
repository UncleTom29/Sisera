from __future__ import annotations

import os

# Must run before any `sisera.config` import (which reads these at module load
# time) — keeps retry-exhaustion tests fast instead of waiting out real backoff.
os.environ.setdefault("SISERA_HTTP_MAX_RETRIES", "1")
os.environ.setdefault("SISERA_HTTP_TIMEOUT", "3")

# Unlike the paid LLM features (llm_fundamental/news_monitor), macro_regime defaults ON in
# production since it's free data with no cost risk (see config.py). But that means any
# test constructing a real Orchestrator and calling run_scan_cycle/reevaluate would
# otherwise make live, unmocked HTTP calls to FRED/DeFiLlama -- slow, flaky, and
# network-dependent for tests that have nothing to do with macro data. Tests that
# specifically want to exercise macro wiring should mock fred_client/defillama_client (or
# construct MacroSnapshot/compute_macro_regime directly, as tests/test_macro_indicator.py
# does) rather than relying on this default.
os.environ.setdefault("SISERA_ENABLE_MACRO_REGIME", "false")
