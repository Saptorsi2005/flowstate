import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuth0 } from "@auth0/auth0-react";

const API_URL = import.meta.env.VITE_API_URL || 'https://your-backend.vercel.app';

export default function Home() {
    const { getAccessTokenSilently, user } = useAuth0();
    const [dashboardData, setDashboardData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        async function fetchDashboard() {
            try {
                const token = await getAccessTokenSilently();
                const response = await fetch(`${API_URL}/api/dashboard`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                });
                
                if (!response.ok) {
                    throw new Error('Failed to fetch dashboard');
                }
                
                const data = await response.json();
                setDashboardData(data);
            } catch (err) {
                console.error('Dashboard fetch error:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        
        fetchDashboard();
    }, [getAccessTokenSilently]);

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
                <div style={{ textAlign: 'center' }}>
                    <div
                        style={{
                            width: 40,
                            height: 40,
                            border: "3px solid rgba(34,211,238,0.3)",
                            borderTopColor: "#22d3ee",
                            borderRadius: "50%",
                            animation: "spin 1s linear infinite",
                            margin: "0 auto 16px",
                        }}
                    />
                    <p style={{ fontSize: 14, color: "#71717a" }}>Loading dashboard...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ textAlign: 'center', padding: 40, color: '#71717a' }}>
                <p>Error loading dashboard: {error}</p>
                <button onClick={() => window.location.reload()} className="btn-primary" style={{ marginTop: 20 }}>
                    Retry
                </button>
            </div>
        );
    }

    const stats = dashboardData?.stats;
    const workspaces = dashboardData?.workspaces || [];
    const weeklyData = dashboardData?.weeklyData || [];

    const formatMinutes = (minutes) => {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (hours === 0) return `${mins}m`;
        return `${hours}h ${mins}m`;
    };

    return (
        <>
            {/* ===== PAGE HEADER ===== */}
            <header className="anim-fade-in-up" style={{ marginBottom: 40 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fafafa", letterSpacing: "-0.03em", margin: 0 }}>
                            Dashboard
                        </h1>
                        <p style={{ fontSize: 14, color: "#52525b", marginTop: 4 }}>
                            Welcome back, {user?.name || 'User'}
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
                        value={formatMinutes(stats?.totalDeepWorkMinutes || 0)}
                        accent="cyan"
                        delay={1}
                    />
                    <StatCard
                        icon={<CheckIcon />}
                        label="Completion Rate"
                        value={`${stats?.completionRate || 0}%`}
                        accent="emerald"
                        delay={2}
                    />
                    <StatCard
                        icon={<ZapIcon />}
                        label="Focus Score"
                        value={`${stats?.todayFocusScore || 0} / 100`}
                        accent="blue"
                        delay={3}
                    />
                    <StatCard
                        icon={<FireIcon />}
                        label="Current Streak"
                        value={`${stats?.currentStreak || 0} days`}
                        accent="orange"
                        delay={4}
                    />
                </div>
            </section>

            {/* ===== WEEKLY PERFORMANCE ===== */}
            {weeklyData.length > 0 && (
                <section style={{ marginBottom: 48 }} className="anim-fade-in-up anim-delay-2">
                    <h2 className="section-title">Weekly Performance</h2>
                    <div className="glass-card-static" style={{ padding: 32 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, height: 200 }}>
                            {weeklyData.map((day, i) => {
                                const maxValue = Math.max(...weeklyData.map(d => d.value), 1);
                                const heightPercent = (day.value / maxValue) * 100;
                                
                                return (
                                    <div
                                        key={i}
                                        style={{
                                            flex: 1,
                                            display: "flex",
                                            flexDirection: "column",
                                            alignItems: "center",
                                            gap: 10,
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: "100%",
                                                height: 200,
                                                display: "flex",
                                                alignItems: "flex-end",
                                            }}
                                        >
                                            <div
                                                style={{
                                                    width: "100%",
                                                    height: `${heightPercent}%`,
                                                    background: heightPercent > 60 
                                                        ? "linear-gradient(to top, #22d3ee, #6366f1)"
                                                        : "linear-gradient(to top, rgba(34,211,238,0.3), rgba(99,102,241,0.3))",
                                                    borderRadius: "8px 8px 0 0",
                                                    transition: "height 0.5s ease",
                                                    minHeight: "4px",
                                                }}
                                            />
                                        </div>
                                        <div style={{ textAlign: "center" }}>
                                            <div style={{ fontSize: 11, color: "#71717a", fontWeight: 600 }}>
                                                {day.day}
                                            </div>
                                            <div style={{ fontSize: 10, color: "#52525b", marginTop: 2 }}>
                                                {day.value}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div style={{ marginTop: 20, fontSize: 12, color: "#71717a", textAlign: "center" }}>
                            Average: {stats?.weeklyAverageFocusScore || 0} / 100
                        </div>
                    </div>
                </section>
            )}

            {/* ===== WORKSPACES ===== */}
            <section style={{ marginBottom: 48 }} className="anim-fade-in-up anim-delay-3">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                    <h2 className="section-title" style={{ margin: 0 }}>Workspaces</h2>
                    <span className="badge badge-blue">
                        {workspaces.length} active
                    </span>
                </div>

                <div style={{ display: "grid", gap: 16 }}>
                    {workspaces.length === 0 ? (
                        <div className="glass-card-static" style={{ padding: 40, textAlign: 'center' }}>
                            <p style={{ color: '#71717a', fontSize: 14 }}>
                                No workspaces synced yet. Use the Chrome Extension to create workspaces.
                            </p>
                        </div>
                    ) : (
                        workspaces.map((ws) => (
                            <WorkspaceCard key={ws.id} workspace={ws} />
                        ))
                    )}
                </div>
            </section>

            {/* ===== ADDITIONAL STATS ===== */}
            <section style={{ marginBottom: 48 }} className="anim-fade-in-up anim-delay-4">
                <h2 className="section-title">Statistics</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
                    <MiniStatCard
                        label="Total Workspaces"
                        value={stats?.totalWorkspaces || 0}
                        icon={<GridIcon />}
                    />
                    <MiniStatCard
                        label="Saved Tabs"
                        value={stats?.totalSavedTabs || 0}
                        icon={<TabsIcon />}
                    />
                    <MiniStatCard
                        label="Blocked Today"
                        value={stats?.totalBlockedAttemptsToday || 0}
                        icon={<ShieldIcon />}
                    />
                </div>
            </section>
        </>
    );
}

// ============================================================================
// COMPONENTS
// ============================================================================

function StatCard({ icon, label, value, accent, delay, custom }) {
    const accentColors = {
        cyan: "#22d3ee",
        emerald: "#34d399",
        blue: "#60a5fa",
        violet: "#a78bfa",
        orange: "#fb923c",
    };

    return (
        <div
            className={`glass-card anim-delay-${delay}`}
            style={{
                padding: 24,
                borderLeft: `3px solid ${accentColors[accent]}`,
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div style={{ color: accentColors[accent], opacity: 0.8 }}>{icon}</div>
                <span style={{ fontSize: 13, color: "#71717a", fontWeight: 600 }}>{label}</span>
            </div>
            {custom || (
                <div style={{ fontSize: 26, fontWeight: 700, color: "#fafafa" }}>
                    {value}
                </div>
            )}
        </div>
    );
}

function MiniStatCard({ label, value, icon }) {
    return (
        <div className="glass-card-static" style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <div style={{ color: "#22d3ee", opacity: 0.7 }}>{icon}</div>
                <span style={{ fontSize: 12, color: "#71717a", fontWeight: 500 }}>
                    {label}
                </span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#fafafa" }}>
                {value}
            </div>
        </div>
    );
}

function WorkspaceCard({ workspace }) {
    const [isOpen, setIsOpen] = useState(false);
    
    const todos = workspace.todos || [];
    const completedTodos = todos.filter(t => t.completed).length;

    return (
        <div className="glass-card-static">
            <div
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    padding: "20px 24px",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                }}
            >
                <div>
                    <h3 style={{ fontSize: 16, fontWeight: 600, color: "#fafafa", margin: 0 }}>
                        {workspace.name}
                    </h3>
                    <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                        <span className="badge badge-cyan" style={{ fontSize: 11 }}>
                            {workspace.focus_mode}
                        </span>
                        {todos.length > 0 && (
                            <span className="badge badge-emerald" style={{ fontSize: 11 }}>
                                {completedTodos}/{todos.length} todos
                            </span>
                        )}
                    </div>
                </div>
                <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#71717a"
                    strokeWidth="2"
                    style={{
                        transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                        transition: "transform 0.2s ease",
                    }}
                >
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </div>

            {isOpen && (
                <div style={{ padding: "0 24px 20px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    {/* Blocked Domains */}
                    {workspace.blocked_domains?.length > 0 && (
                        <div style={{ marginTop: 16 }}>
                            <div style={{ fontSize: 12, color: "#71717a", fontWeight: 600, marginBottom: 8 }}>
                                Blocked Domains
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                {workspace.blocked_domains.map((domain, i) => (
                                    <span
                                        key={i}
                                        style={{
                                            fontSize: 11,
                                            padding: "4px 10px",
                                            background: "rgba(248,113,113,0.1)",
                                            color: "#f87171",
                                            borderRadius: 999,
                                            border: "1px solid rgba(248,113,113,0.2)",
                                        }}
                                    >
                                        {domain}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Allowed Domains */}
                    {workspace.allowed_domains?.length > 0 && (
                        <div style={{ marginTop: 16 }}>
                            <div style={{ fontSize: 12, color: "#71717a", fontWeight: 600, marginBottom: 8 }}>
                                Allowed Domains
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                {workspace.allowed_domains.map((domain, i) => (
                                    <span
                                        key={i}
                                        style={{
                                            fontSize: 11,
                                            padding: "4px 10px",
                                            background: "rgba(52,211,153,0.1)",
                                            color: "#34d399",
                                            borderRadius: 999,
                                            border: "1px solid rgba(52,211,153,0.2)",
                                        }}
                                    >
                                        {domain}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Todos */}
                    {todos.length > 0 && (
                        <div style={{ marginTop: 16 }}>
                            <div style={{ fontSize: 12, color: "#71717a", fontWeight: 600, marginBottom: 8 }}>
                                To-Do List
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {todos.map((todo, i) => (
                                    <div
                                        key={i}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 8,
                                            fontSize: 13,
                                            color: todo.completed ? "#52525b" : "#d4d4d8",
                                            textDecoration: todo.completed ? "line-through" : "none",
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: 16,
                                                height: 16,
                                                borderRadius: 4,
                                                border: todo.completed ? "2px solid #34d399" : "2px solid rgba(255,255,255,0.15)",
                                                background: todo.completed ? "rgba(52,211,153,0.2)" : "transparent",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                flexShrink: 0,
                                            }}
                                        >
                                            {todo.completed && (
                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="3">
                                                    <polyline points="20 6 9 17 4 12" />
                                                </svg>
                                            )}
                                        </div>
                                        {todo.text}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ============================================================================
// ICONS
// ============================================================================

function ClockIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
        </svg>
    );
}

function CheckIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
        </svg>
    );
}

function ZapIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
    );
}

function FireIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C12 2 7 6 7 11C7 14.31 9.69 17 13 17C16.31 17 19 14.31 19 11C19 6 14 2 14 2C14 2 14.5 4.5 12 7C9.5 4.5 12 2 12 2Z" />
        </svg>
    );
}

function GridIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
        </svg>
    );
}

function TabsIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
        </svg>
    );
}

function ShieldIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
    );
}
