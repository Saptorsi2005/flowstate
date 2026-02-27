import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import Sidebar from "../components/Sidebar";

export default function Landing() {
    const [mode, setMode] = useState("easy");
    const [threshold, setThreshold] = useState(50);
    const aiEasyLevel = 3;
    const [workspaces, setWorkspaces] = useState([
        {
            id: 1,
            name: "Development",
            links: ["https://github.com", "https://stackoverflow.com"],
            newLink: "",
            isOpen: true,
            targetMinutes: 60,
            elapsedSeconds: 0,
            isRunning: false,
        },
        {
            id: 2,
            name: "Learning",
            links: ["https://youtube.com", "https://udemy.com"],
            newLink: "",
            isOpen: false,
            targetMinutes: 45,
            elapsedSeconds: 0,
            isRunning: false,
        },
    ]);

    const [newWorkspaceName, setNewWorkspaceName] = useState("");

    const createWorkspace = () => {
        if (!newWorkspaceName.trim()) return;
        const newWorkspace = {
            id: Date.now(),
            name: newWorkspaceName,
            links: [],
            newLink: "",
            isOpen: true,
            targetMinutes: 30,
            elapsedSeconds: 0,
            isRunning: false,
        };
        setWorkspaces([...workspaces, newWorkspace]);
        setNewWorkspaceName("");
    };

    const deleteWorkspace = (id) => {
        setWorkspaces(workspaces.filter((ws) => ws.id !== id));
    };

    const updateWorkspaceLinkInput = (id, value) => {
        setWorkspaces(
            workspaces.map((ws) =>
                ws.id === id ? { ...ws, newLink: value } : ws
            )
        );
    };

    const addLinkToWorkspace = (id) => {
        setWorkspaces(
            workspaces.map((ws) => {
                if (ws.id === id && ws.newLink.trim()) {
                    return {
                        ...ws,
                        links: [...ws.links, ws.newLink],
                        newLink: "",
                    };
                }
                return ws;
            })
        );
    };

    const deleteLink = (workspaceId, linkIndex) => {
        setWorkspaces(
            workspaces.map((ws) => {
                if (ws.id === workspaceId) {
                    return {
                        ...ws,
                        links: ws.links.filter((_, index) => index !== linkIndex),
                    };
                }
                return ws;
            })
        );
    };

    const toggleWorkspace = (id) => {
        setWorkspaces(
            workspaces.map((ws) =>
                ws.id === id ? { ...ws, isOpen: !ws.isOpen } : ws
            )
        );
    };

    const openAllTabs = (links) => {
        links.forEach((link) => {
            window.open(link, "_blank");
        });
    };

    useEffect(() => {
        const interval = setInterval(() => {
            setWorkspaces((prev) =>
                prev.map((ws) =>
                    ws.isRunning
                        ? { ...ws, elapsedSeconds: ws.elapsedSeconds + 1 }
                        : ws
                )
            );
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const toggleTimer = (id) => {
        setWorkspaces(
            workspaces.map((ws) =>
                ws.id === id ? { ...ws, isRunning: !ws.isRunning } : ws
            )
        );
    };

    const resetTimer = (id) => {
        setWorkspaces(
            workspaces.map((ws) =>
                ws.id === id
                    ? { ...ws, elapsedSeconds: 0, isRunning: false }
                    : ws
            )
        );
    };

    const updateTarget = (id, value) => {
        setWorkspaces(
            workspaces.map((ws) =>
                ws.id === id ? { ...ws, targetMinutes: Number(value) } : ws
            )
        );
    };

    // Helper to format domain from URL
    const getDomain = (url) => {
        try {
            return new URL(url).hostname.replace("www.", "");
        } catch {
            return url;
        }
    };

    return (
        <div className="page-layout">
            <Sidebar />
            {/* Ambient glows */}
            <div className="ambient-glow ambient-glow-1" />
            <div className="ambient-glow ambient-glow-2" />

            <main className="page-content">
                {/* ===== PAGE HEADER ===== */}
                <header className="anim-fade-in-up" style={{ marginBottom: 40 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                            <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fafafa", letterSpacing: "-0.03em", margin: 0 }}>
                                Dashboard
                            </h1>
                            <p style={{ fontSize: 14, color: "#52525b", marginTop: 4 }}>
                                Manage your focus and workspaces
                            </p>
                        </div>
                        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                            <span className="badge badge-cyan">
                                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22d3ee", display: "inline-block" }} />
                                Active
                            </span>
                        </div>
                    </div>
                </header>

                {/* ===== OVERVIEW STATS ===== */}
                <section style={{ marginBottom: 48 }} className="anim-fade-in-up anim-delay-1">
                    <h2 className="section-title">Overview</h2>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
                        <StatCard
                            icon={<ClockIcon />}
                            label="Today's Deep Work"
                            value="3h 25m"
                            accent="cyan"
                            delay={1}
                        />
                        <StatCard
                            icon={<CheckIcon />}
                            label="Completion Rate"
                            value="78%"
                            accent="emerald"
                            delay={2}
                        />
                        <StatCard
                            icon={<ZapIcon />}
                            label="Focus Score"
                            value="82 / 100"
                            accent="blue"
                            delay={3}
                        />
                        <StatCard
                            icon={<BrainIcon />}
                            label="AI Reflection"
                            value=""
                            accent="violet"
                            delay={4}
                            custom={
                                <p style={{ fontSize: 13, color: "#a1a1aa", lineHeight: 1.6, margin: 0 }}>
                                    You stayed focused for long stretches but distractions spike after 40 minutes.
                                </p>
                            }
                        />
                    </div>
                </section>

                {/* ===== FOCUS SETTINGS ===== */}
                <section style={{ marginBottom: 48 }} className="anim-fade-in-up anim-delay-3">
                    <h2 className="section-title">Focus Settings</h2>
                    <div className="glass-card-static" style={{ padding: 28 }}>
                        {/* Mode Toggle */}
                        <div style={{ marginBottom: 28 }}>
                            <label style={{ fontSize: 12, fontWeight: 600, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 12 }}>
                                Focus Mode
                            </label>
                            <div style={{ display: "flex", gap: 8 }}>
                                <ModeButton
                                    active={mode === "easy"}
                                    onClick={() => setMode("easy")}
                                    label="Easy"
                                    color="#22d3ee"
                                />
                                <ModeButton
                                    active={mode === "strict"}
                                    onClick={() => setMode("strict")}
                                    label="Strict"
                                    color="#f43f5e"
                                />
                            </div>
                            {mode === "easy" && (
                                <p style={{ fontSize: 12, color: "#52525b", marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22d3ee", display: "inline-block" }} />
                                    AI Level {aiEasyLevel} selected
                                </p>
                            )}
                        </div>

                        {/* Threshold Slider */}
                        <div style={{ marginBottom: 28 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                    Similarity Threshold
                                </label>
                                <span style={{
                                    fontSize: 13,
                                    fontWeight: 700,
                                    color: "#22d3ee",
                                    background: "rgba(34,211,238,0.1)",
                                    padding: "3px 10px",
                                    borderRadius: 999,
                                }}>
                                    {threshold}%
                                </span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={threshold}
                                onChange={(e) => setThreshold(e.target.value)}
                            />
                        </div>

                        {/* Reset */}
                        <button className="btn-danger">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                            </svg>
                            Reset All Data
                        </button>
                    </div>
                </section>

                {/* ===== WORKSPACES ===== */}
                <section className="anim-fade-in-up anim-delay-5">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                        <h2 className="section-title" style={{ margin: 0 }}>Workspaces</h2>
                        <span className="badge badge-cyan">{workspaces.length} total</span>
                    </div>

                    {/* Create Workspace */}
                    <div style={{ display: "flex", gap: 10, marginBottom: 28 }}>
                        <input
                            type="text"
                            placeholder="New workspace name..."
                            value={newWorkspaceName}
                            onChange={(e) => setNewWorkspaceName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && createWorkspace()}
                            className="input-field"
                            style={{ maxWidth: 340 }}
                        />
                        <button onClick={createWorkspace} className="btn-primary">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                <path d="M12 5v14M5 12h14" />
                            </svg>
                            Create
                        </button>
                    </div>

                    {/* Workspace Cards */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        {workspaces.map((ws, i) => {
                            const totalSeconds = ws.targetMinutes * 60;
                            const progress = Math.min(
                                (ws.elapsedSeconds / totalSeconds) * 100,
                                100
                            );
                            const circumference = 2 * Math.PI * 38;
                            const dashOffset =
                                circumference - (progress / 100) * circumference;

                            const mins = Math.floor(ws.elapsedSeconds / 60)
                                .toString()
                                .padStart(2, "0");
                            const secs = (ws.elapsedSeconds % 60)
                                .toString()
                                .padStart(2, "0");

                            return (
                                <div
                                    key={ws.id}
                                    className={`glass-card-static anim-fade-in-up anim-delay-${Math.min(i + 1, 8)}`}
                                    style={{ padding: 0, overflow: "hidden" }}
                                >
                                    {/* Workspace Header */}
                                    <div
                                        style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                            padding: "18px 24px",
                                            background: "rgba(255,255,255,0.02)",
                                            borderBottom: ws.isOpen
                                                ? "1px solid rgba(255,255,255,0.05)"
                                                : "none",
                                        }}
                                    >
                                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                            <button
                                                onClick={() => toggleWorkspace(ws.id)}
                                                className="btn-icon"
                                                style={{
                                                    transform: ws.isOpen ? "rotate(0deg)" : "rotate(-90deg)",
                                                    transition: "transform 300ms ease",
                                                }}
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                                    <path d="M6 9l6 6 6-6" />
                                                </svg>
                                            </button>

                                            <div>
                                                <h3 style={{ fontSize: 16, fontWeight: 700, color: "#fafafa", margin: 0 }}>
                                                    {ws.name}
                                                </h3>
                                                <span style={{ fontSize: 12, color: "#52525b" }}>
                                                    {ws.links.length} link{ws.links.length !== 1 ? "s" : ""}
                                                </span>
                                            </div>
                                        </div>

                                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                            {ws.isRunning && (
                                                <span className="badge badge-emerald" style={{ animation: "pulseGlow 2s infinite" }}>
                                                    ● Running
                                                </span>
                                            )}
                                            <button
                                                onClick={() => openAllTabs(ws.links)}
                                                className="btn-success"
                                                style={{ padding: "7px 14px", fontSize: 13 }}
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                                    <polyline points="15 3 21 3 21 9" />
                                                    <line x1="10" y1="14" x2="21" y2="3" />
                                                </svg>
                                                Open All
                                            </button>
                                            <button
                                                onClick={() => deleteWorkspace(ws.id)}
                                                className="btn-danger"
                                                style={{ padding: "7px 14px", fontSize: 13 }}
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                                    <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                                                </svg>
                                                Delete
                                            </button>
                                        </div>
                                    </div>

                                    {/* Workspace Body */}
                                    {ws.isOpen && (
                                        <div style={{ padding: "20px 24px 24px" }}>
                                            {/* Timer Section */}
                                            <div
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 28,
                                                    padding: 20,
                                                    background: "rgba(255,255,255,0.02)",
                                                    borderRadius: "var(--radius-lg)",
                                                    border: "1px solid rgba(255,255,255,0.04)",
                                                    marginBottom: 20,
                                                }}
                                            >
                                                {/* Circular Timer */}
                                                <div style={{ position: "relative", flexShrink: 0 }}>
                                                    <svg width="96" height="96" viewBox="0 0 96 96" className="timer-ring">
                                                        <circle
                                                            cx="48" cy="48" r="38"
                                                            className="timer-ring-bg"
                                                            strokeWidth="5"
                                                        />
                                                        <circle
                                                            cx="48" cy="48" r="38"
                                                            className="timer-ring-progress"
                                                            strokeWidth="5"
                                                            stroke={ws.isRunning ? "#22d3ee" : "#3f3f46"}
                                                            strokeDasharray={circumference}
                                                            strokeDashoffset={dashOffset}
                                                            style={{
                                                                filter: ws.isRunning ? "drop-shadow(0 0 6px rgba(34,211,238,0.4))" : "none",
                                                            }}
                                                        />
                                                    </svg>
                                                    <div
                                                        style={{
                                                            position: "absolute",
                                                            inset: 0,
                                                            display: "flex",
                                                            flexDirection: "column",
                                                            alignItems: "center",
                                                            justifyContent: "center",
                                                            transform: "rotate(0deg)",
                                                        }}
                                                    >
                                                        <span style={{ fontSize: 18, fontWeight: 700, color: "#fafafa", fontVariantNumeric: "tabular-nums" }}>
                                                            {mins}:{secs}
                                                        </span>
                                                        <span style={{ fontSize: 10, color: "#52525b" }}>
                                                            / {ws.targetMinutes}m
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Timer Controls */}
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                                                        <label style={{ fontSize: 12, color: "#71717a", fontWeight: 500 }}>
                                                            Target (min)
                                                        </label>
                                                        <input
                                                            type="number"
                                                            value={ws.targetMinutes}
                                                            onChange={(e) => updateTarget(ws.id, e.target.value)}
                                                            className="input-field"
                                                            style={{ width: 80, padding: "6px 10px", fontSize: 13 }}
                                                        />
                                                    </div>
                                                    <div style={{ display: "flex", gap: 8 }}>
                                                        <button
                                                            onClick={() => toggleTimer(ws.id)}
                                                            className={ws.isRunning ? "btn-secondary" : "btn-primary"}
                                                            style={{ padding: "8px 18px", fontSize: 13 }}
                                                        >
                                                            {ws.isRunning ? (
                                                                <>
                                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                                                        <rect x="6" y="4" width="4" height="16" rx="1" />
                                                                        <rect x="14" y="4" width="4" height="16" rx="1" />
                                                                    </svg>
                                                                    Pause
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                                                        <polygon points="5 3 19 12 5 21 5 3" />
                                                                    </svg>
                                                                    Start
                                                                </>
                                                            )}
                                                        </button>
                                                        <button
                                                            onClick={() => resetTimer(ws.id)}
                                                            className="btn-danger"
                                                            style={{ padding: "8px 18px", fontSize: 13 }}
                                                        >
                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                                                <path d="M1 4v6h6" />
                                                                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                                                            </svg>
                                                            Reset
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Add Link */}
                                            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                                                <input
                                                    type="text"
                                                    placeholder="Paste a link..."
                                                    value={ws.newLink}
                                                    onChange={(e) =>
                                                        updateWorkspaceLinkInput(ws.id, e.target.value)
                                                    }
                                                    onKeyDown={(e) =>
                                                        e.key === "Enter" &&
                                                        addLinkToWorkspace(ws.id)
                                                    }
                                                    className="input-field"
                                                />
                                                <button
                                                    onClick={() => addLinkToWorkspace(ws.id)}
                                                    className="btn-primary"
                                                    style={{ padding: "10px 18px", flexShrink: 0 }}
                                                >
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                                        <path d="M12 5v14M5 12h14" />
                                                    </svg>
                                                    Add
                                                </button>
                                            </div>

                                            {/* Links List */}
                                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                                {ws.links.map((link, index) => (
                                                    <div key={index} className="link-chip">
                                                        <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden", flex: 1 }}>
                                                            <img
                                                                src={`https://www.google.com/s2/favicons?domain=${getDomain(link)}&sz=32`}
                                                                alt=""
                                                                style={{ width: 16, height: 16, borderRadius: 3, flexShrink: 0 }}
                                                                onError={(e) => e.target.style.display = "none"}
                                                            />
                                                            <a
                                                                href={link}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                            >
                                                                {getDomain(link)}
                                                            </a>
                                                        </div>
                                                        <button
                                                            onClick={() => deleteLink(ws.id, index)}
                                                            className="btn-icon"
                                                            style={{ width: 28, height: 28, fontSize: 14, color: "#f43f5e", border: "none", background: "rgba(244,63,94,0.08)" }}
                                                        >
                                                            ×
                                                        </button>
                                                    </div>
                                                ))}
                                                {ws.links.length === 0 && (
                                                    <p style={{ fontSize: 13, color: "#3f3f46", textAlign: "center", padding: "16px 0" }}>
                                                        No links yet — paste one above to get started
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>
            </main>
        </div>
    );
}

/* ============================
   SUB-COMPONENTS
   ============================ */

function StatCard({ icon, label, value, accent, delay, custom }) {
    const colorMap = {
        cyan: { color: "#22d3ee", bg: "rgba(34,211,238,0.08)", border: "rgba(34,211,238,0.15)" },
        emerald: { color: "#34d399", bg: "rgba(52,211,153,0.08)", border: "rgba(52,211,153,0.15)" },
        blue: { color: "#3b82f6", bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.15)" },
        violet: { color: "#8b5cf6", bg: "rgba(139,92,246,0.08)", border: "rgba(139,92,246,0.15)" },
        amber: { color: "#fbbf24", bg: "rgba(251,191,36,0.08)", border: "rgba(251,191,36,0.15)" },
    };
    const c = colorMap[accent] || colorMap.cyan;

    return (
        <div
            className={`glass-card anim-fade-in-up anim-delay-${delay}`}
            style={{ padding: "22px 24px", cursor: "default" }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span
                    style={{
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        background: c.bg,
                        border: `1px solid ${c.border}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: c.color,
                        flexShrink: 0,
                    }}
                >
                    {icon}
                </span>
                <span style={{ fontSize: 13, color: "#71717a", fontWeight: 500 }}>{label}</span>
            </div>
            {custom || (
                <p style={{ fontSize: 28, fontWeight: 800, color: c.color, margin: 0, letterSpacing: "-0.02em" }}>
                    {value}
                </p>
            )}
        </div>
    );
}

function ModeButton({ active, onClick, label, color }) {
    return (
        <button
            onClick={onClick}
            style={{
                padding: "8px 20px",
                fontSize: 13,
                fontWeight: 600,
                borderRadius: 10,
                border: active
                    ? `1px solid ${color}40`
                    : "1px solid rgba(255,255,255,0.06)",
                background: active
                    ? `${color}18`
                    : "rgba(255,255,255,0.03)",
                color: active ? color : "#71717a",
                cursor: "pointer",
                transition: "all 200ms ease",
                boxShadow: active ? `0 0 12px ${color}20` : "none",
            }}
        >
            {label}
        </button>
    );
}

/* ============================
   SVG ICONS
   ============================ */
function ClockIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
        </svg>
    );
}
function CheckIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="20 6 9 17 4 12" />
        </svg>
    );
}
function ZapIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
    );
}
function BrainIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 2a5 5 0 0 1 5 5c0 .98-.28 1.89-.77 2.66A5 5 0 0 1 17 12a5 5 0 0 1-2.08 4.07A4 4 0 0 1 12 22a4 4 0 0 1-2.92-5.93A5 5 0 0 1 7 12a5 5 0 0 1 .77-2.34A5 5 0 0 1 12 2z" />
            <path d="M12 2v20" />
        </svg>
    );
}