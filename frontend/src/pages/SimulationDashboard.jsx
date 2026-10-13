import { useState, useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import Card from "../components/ui/Card";
import LineChart from "../components/ui/LineChart";
import Skeleton from "../components/ui/Skeleton";
import { simAPI, mlAPI } from "../services/api";
import { formatPop } from "../utils/format";

const BACKEND_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;

const COLORS = {
  plants: "#4ADE80",
  herbivores: "#60A5FA",
  carnivores: "#F87171",
};

const SPEEDS = [1, 2, 5, 10];

function CollapseGauge({ risk }) {
  const pct = Math.min(100, Math.max(0, Math.round(risk * 100)));
  const strokeColor = pct < 30 ? "#4ADE80" : pct < 70 ? "#F59E0B" : "#EF4444";
  const isCritical = pct > 70;
  const r = 60;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (pct / 100) * circumference;

  let interpretation = "Ecosystem is stable \u2014 low risk of collapse";
  if (pct >= 70) interpretation = "Critical \u2014 intervention may be needed";
  else if (pct >= 30) interpretation = "Warning signs detected \u2014 monitor closely";

  return (
    <div className="flex items-center gap-6 py-2">
      <div className="flex flex-col items-center shrink-0">
        <svg width="140" height="140" viewBox="0 0 160 160" className={isCritical ? "animate-pulse" : ""}>
          <circle cx="80" cy="80" r={r} fill="none" stroke="#1C2E1C" strokeWidth="8" />
          <circle cx="80" cy="80" r={r} fill="none" stroke={strokeColor} strokeWidth="8"
            strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round" transform="rotate(-90 80 80)"
            style={{ transition: "stroke-dashoffset 0.6s ease", filter: isCritical ? "drop-shadow(0 0 8px #EF4444)" : "none" }} />
          <text x="80" y="75" textAnchor="middle" fill="#E8F5E8" fontSize="24" fontFamily="JetBrains Mono" fontWeight="600">
            {pct}%
          </text>
          <text x="80" y="100" textAnchor="middle" fill="#4D7A4D" fontSize="9" fontFamily="JetBrains Mono">
            COLLAPSE RISK
          </text>
        </svg>
      </div>
      <p className="text-text-secondary text-sm leading-relaxed">{interpretation}</p>
    </div>
  );
}

function ForecastCard({ forecast }) {
  if (!forecast || !forecast.predictions || forecast.predictions.length === 0) {
    return (
      <div className="text-text-muted text-xs font-mono text-center py-4">
        Awaiting data for forecast...
      </div>
    );
  }

  const steps = forecast.predictions.slice(0, 5);
  const modelLabel = forecast.model_version || "v?";

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-text-muted font-mono text-xs tracking-widest">POPULATION FORECAST</p>
        <Badge variant="neutral">{modelLabel}</Badge>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="text-text-muted border-b border-border">
              <th className="text-left py-1 pr-2">Step</th>
              <th className="text-right px-1 text-plants">P</th>
              <th className="text-right px-1 text-herbivores">H</th>
              <th className="text-right px-1 text-carnivores">C</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((pred, i) => (
              <tr key={i} className="border-b border-border/40">
                <td className="py-1 pr-2 text-text-muted">+{i + 1}</td>
                <td className="text-right px-1 text-plants">{formatPop(pred[0])}</td>
                <td className="text-right px-1 text-herbivores">{formatPop(pred[1])}</td>
                <td className="text-right px-1 text-carnivores">{formatPop(pred[2])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-text-muted text-[10px] font-mono mt-2">
        Generated {new Date(forecast.generated_at).toLocaleTimeString()}
      </p>
    </div>
  );
}

export default function Dashboard() {
  const [state, setState] = useState({ plants: 1000, herbivores: 200, carnivores: 50, tick: 0 });
  const [prevState, setPrevState] = useState(null);
  const [history, setHistory] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [insight, setInsight] = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightTime, setInsightTime] = useState(null);
  const [collapseRisk, setCollapseRisk] = useState(0);
  const [initialPlants, setInitialPlants] = useState(1000);
  const [initialHerbivores, setInitialHerbivores] = useState(200);
  const [initialCarnivores, setInitialCarnivores] = useState(50);
  const [forecast, setForecast] = useState(null);

  const socketRef = useRef(null);
  const tickCountRef = useRef(0);
  const lastCollapseFetch = useRef(0);
  const lastForecastFetch = useRef(0);

  useEffect(() => {
    const socket = io(BACKEND_URL, {
      transports: ["websocket"],
      auth: { token: localStorage.getItem("token") },
    });
    socketRef.current = socket;

    socket.on("connect", () => setIsConnected(true));
    socket.on("disconnect", () => setIsConnected(false));
    socket.on("tick:update", (data) => {
      const norm = {
        plants: data.plants,
        herbivores: data.herbivores,
        carnivores: data.carnivores,
        tick: data.tick ?? data.step ?? 0,
      };
      setPrevState((p) => p || norm);
      setState(norm);
      setHistory((h) => [...h.slice(-199), {
        step: norm.tick,
        plants: data.plants,
        herbivores: data.herbivores,
        carnivores: data.carnivores,
      }]);
      tickCountRef.current += 1;
    });
    socket.on("simulation-toggle", (data) => setIsRunning(data.isRunning));
    socket.on("simulation-speed", (data) => setSpeed(data.speed));

    return () => { socket.disconnect(); };
  }, []);

  // Live collapse risk — every tick, throttled to 2s
  useEffect(() => {
    const now = Date.now();
    if (tickCountRef.current > 0 && history.length >= 5 && now - lastCollapseFetch.current > 2000) {
      lastCollapseFetch.current = now;
      mlAPI.collapse({
        plants: state.plants,
        herbivores: state.herbivores,
        carnivores: state.carnivores,
        tick: state.tick,
        history: history.slice(-5),
      }).then((res) => {
        if (res.data) setCollapseRisk(res.data.risk_score ?? 0);
      }).catch(() => {});
    }
  }, [state.plants, state.herbivores, state.carnivores, state.tick, history]);

  // Forecast — every 15 ticks, throttled to 10s
  useEffect(() => {
    const now = Date.now();
    if (tickCountRef.current > 0 && tickCountRef.current % 15 === 0 && history.length >= 20 && now - lastForecastFetch.current > 10000) {
      lastForecastFetch.current = now;
      mlAPI.forecast({
        plants: state.plants,
        herbivores: state.herbivores,
        carnivores: state.carnivores,
        tick: state.tick,
        history: history.slice(-20),
      }).then((res) => {
        if (res.data) setForecast(res.data);
      }).catch(() => {});
    }
  }, [state.plants, state.herbivores, state.carnivores, state.tick, history]);

  const fetchInsight = useCallback(async () => {
    setInsightLoading(true);
    try {
      const res = await mlAPI.insights({
        plants: state.plants,
        herbivores: state.herbivores,
        carnivores: state.carnivores,
        tick: state.tick,
      });
      if (res.data) {
        setInsight(res.data);
        setInsightTime(Date.now());
      }
    } catch (_e) {
      // insight fetch failed — will retry on next interval
    }
    setInsightLoading(false);
  }, [state.plants, state.herbivores, state.carnivores, state.tick]);

  const fetchInsightRef = useRef(fetchInsight);
  fetchInsightRef.current = fetchInsight;

  useEffect(() => {
    fetchInsightRef.current();
    const interval = setInterval(() => fetchInsightRef.current(), 30000);
    return () => clearInterval(interval);
  }, []);

  const handleStart = () => {
    setIsRunning(true);
    simAPI.toggle().catch(() => {});
  };

  const handleStop = () => {
    setIsRunning(false);
    simAPI.toggle().catch(() => {});
  };

  const handleReset = () => {
    setHistory([]);
    setPrevState(null);
    setCollapseRisk(0);
    setForecast(null);
    tickCountRef.current = 0;
    lastCollapseFetch.current = 0;
    lastForecastFetch.current = 0;
    const initState = {
      plants: initialPlants,
      herbivores: initialHerbivores,
      carnivores: initialCarnivores,
      tick: 0,
    };
    setState(initState);
    simAPI.reset().catch(() => {});
  };

  const handleSpeed = (s) => {
    setSpeed(s);
    simAPI.speed(s).catch(() => {});
  };

  const deltas = prevState ? {
    plants: state.plants - prevState.plants,
    herbivores: state.herbivores - prevState.herbivores,
    carnivores: state.carnivores - prevState.carnivores,
  } : { plants: 0, herbivores: 0, carnivores: 0 };

  const secondsAgo = insightTime ? Math.floor((Date.now() - insightTime) / 1000) : null;

  return (
    <div className="grid gap-4 min-h-screen bg-base p-4 animate-fade-in" style={{ gridTemplateColumns: "260px 1fr 280px" }}>
      {/* LEFT COLUMN — Controls */}
      <div className="space-y-4">
        <Card>
          <p className="text-text-muted font-mono text-xs tracking-widest mb-4">SIMULATION</p>

          {isRunning ? (
            <Button variant="primary" className="w-full" disabled>
              <span className="relative flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                Running...
              </span>
            </Button>
          ) : (
            <Button variant="primary" className="w-full" onClick={handleStart}>Start</Button>
          )}

          <Button variant="ghost" className="w-full mt-2" onClick={handleStop}>Stop</Button>
          <Button variant="danger" className="w-full mt-2" onClick={handleReset}>Reset</Button>

          <div className="border-t border-border my-3" />

          <p className="text-text-muted font-mono text-xs tracking-widest mb-2">SPEED</p>
          <div className="grid grid-cols-4 gap-1">
            {SPEEDS.map((s) => (
              <button key={s}
                onClick={() => handleSpeed(s)}
                className={`px-2 py-1.5 text-xs font-mono rounded transition-colors ${
                  speed === s
                    ? "bg-accent-muted text-accent border border-accent/30"
                    : "bg-elevated text-text-secondary border border-border"
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          <div className="border-t border-border my-3" />

          <p className="text-text-muted font-mono text-xs tracking-widest mb-3">INITIAL POPULATIONS</p>

          {[
            { label: "Plants", key: "plants", color: "#4ADE80", val: initialPlants, set: setInitialPlants },
            { label: "Herbivores", key: "herbivores", color: "#60A5FA", val: initialHerbivores, set: setInitialHerbivores },
            { label: "Carnivores", key: "carnivores", color: "#F87171", val: initialCarnivores, set: setInitialCarnivores },
          ].map(({ label, color, val, set }) => (
            <div key={label} className="mb-2 last:mb-0">
              <label className="text-text-muted text-xs flex items-center gap-1.5 mb-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                {label}
              </label>
              <input type="number"
                value={val}
                onChange={(e) => set(Number(e.target.value))}
                className="w-full bg-elevated border border-border rounded text-text-primary font-mono text-sm px-2 py-1.5
                  focus:border-accent outline-none ring-1 ring-accent/20"
              />
            </div>
          ))}

          <div className="border-t border-border my-3" />

          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-accent" : "bg-danger"} ${isConnected ? "" : "animate-pulse"}`} />
            <span className="text-text-muted text-xs font-mono">{isConnected ? "Connected" : "Disconnected"}</span>
          </div>
        </Card>
      </div>

      {/* CENTER COLUMN — Live Chart */}
      <div className="space-y-4 flex flex-col">
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Plants", key: "plants", value: state.plants, delta: deltas.plants, colorClass: "text-plants", color: COLORS.plants },
            { label: "Herbivores", key: "herbivores", value: state.herbivores, delta: deltas.herbivores, colorClass: "text-herbivores", color: COLORS.herbivores },
            { label: "Carnivores", key: "carnivores", value: state.carnivores, delta: deltas.carnivores, colorClass: "text-carnivores", color: COLORS.carnivores },
          ].map(({ label, key, value, delta, colorClass, color }) => (
            <div key={label} className="bg-surface border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                <p className="text-text-muted text-xs font-mono uppercase tracking-wider">{label}</p>
              </div>
              <p className={`text-2xl font-mono font-medium stat-value ${colorClass}`}>
                {formatPop(value)}
              </p>
              {delta !== 0 && (
                <p className={`text-xs font-mono mt-1 animate-slide-up ${delta > 0 ? "text-accent" : "text-danger"}`}>
                  {delta > 0 ? "\u2191" : "\u2193"} {formatPop(Math.abs(delta))}
                </p>
              )}
            </div>
          ))}
        </div>

        <Card className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between mb-3">
            <p className="text-text-muted font-mono text-xs tracking-widest">POPULATION DYNAMICS</p>
            <span className="text-accent font-mono text-xs">TICK {(state.tick ?? 0).toLocaleString()}</span>
          </div>
          <div className="flex-1">
            <LineChart data={history} series={[
              { key: "plants", color: COLORS.plants, label: "Plants" },
              { key: "herbivores", color: COLORS.herbivores, label: "Herbivores" },
              { key: "carnivores", color: COLORS.carnivores, label: "Carnivores" },
            ]} height={300} />
          </div>
        </Card>

        <Card>
          <CollapseGauge risk={collapseRisk} />
        </Card>
      </div>

      {/* RIGHT COLUMN — AI Analysis + Forecast */}
      <div className="space-y-4">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <p className="text-text-muted font-mono text-xs tracking-widest">AI ANALYSIS</p>
            <Badge variant="neutral">{insight?.model || "local"}</Badge>
          </div>

          {insightLoading ? (
            <div className="space-y-2">
              <Skeleton height="0.75rem" />
              <Skeleton height="0.75rem" width="85%" />
              <Skeleton height="0.75rem" width="65%" />
            </div>
          ) : (
            <p className="text-text-secondary text-sm leading-relaxed">
              {insight?.insight || "No insight yet"}
            </p>
          )}

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
            <Button variant="ghost" size="sm" onClick={fetchInsight}>
              ↻ Refresh
            </Button>
            {secondsAgo !== null && (
              <span className="text-text-muted text-xs font-mono">Updated {secondsAgo}s ago</span>
            )}
          </div>

          <div className="mt-3 pt-3 border-t border-border space-y-1.5">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-text-muted">Collapse Risk</span>
              <span className={collapseRisk < 0.3 ? "text-plants" : collapseRisk < 0.7 ? "text-warning" : "text-danger"}>
                {Math.round(collapseRisk * 100)}%
              </span>
            </div>
            <div className="flex justify-between text-xs font-mono">
              <span className="text-text-muted">Trend</span>
              <span className="text-text-secondary">
                {deltas.plants + deltas.herbivores + deltas.carnivores > 0 ? "\u2191 Growing" : "\u2193 Declining"}
              </span>
            </div>
            <div className="flex justify-between text-xs font-mono">
              <span className="text-text-muted">Tick</span>
              <span className="text-text-secondary">{(state.tick ?? 0).toLocaleString()}</span>
            </div>
          </div>
        </Card>

        <Card>
          <ForecastCard forecast={forecast} />
        </Card>
      </div>
    </div>
  );
}
