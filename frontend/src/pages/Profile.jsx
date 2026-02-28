import { useState } from "react";
import { Link } from "react-router-dom";
import { ActivityCalendar } from "react-activity-calendar";
import { subDays, format } from "date-fns";

export default function Profile() {
    const [isEditing, setIsEditing] = useState(false);

    const [user, setUser] = useState({
        name: "Pritam Bhowmik",
        email: "pritam@example.com",
        image: "https://i.pravatar.cc/150?img=3",
    });

    const handleChange = (e) => {
        setUser({ ...user, [e.target.name]: e.target.value });
    };

    const stats = [
        { label: "Workspaces", value: "5", icon: <GridIcon /> },
        { label: "Hours Focused", value: "42h", icon: <ClockIcon /> },
        { label: "Day Streak", value: "12", icon: <FireIcon /> },
    ];

    const analytics = [
        {
            label: "Time to First Distraction",
            value: "18 mins",
            icon: <TimerIcon />,
            accent: "cyan",
        },
        {
            label: "Distraction Frequency",
            value: "Every 27 mins",
            icon: <AlertIcon />,
            accent: "amber",
        },
        {
            label: "Peak Distraction Time",
            value: "4:30 PM",
            icon: <SunsetIcon />,
            accent: "rose",
        },
    ];

    const weeklyData = [
        { day: "Mon", value: 40 },
        { day: "Tue", value: 70 },
        { day: "Wed", value: 60 },
        { day: "Thu", value: 90 },
        { day: "Fri", value: 75 },
        { day: "Sat", value: 80 },
        { day: "Sun", value: 85 },
    ];

    const goals = [
        {
            id: 1,
            name: "Build Extension UI",
            completion: 85,
            time: "2h 10m",
            distractions: 3,
            status: "completed",
        },
        {
            id: 2,
            name: "Backend API Setup",
            completion: 60,
            time: "1h 45m",
            distractions: 5,
            status: "in-progress",
        },
    ];

    // Generate mock heatmap data (last 6 months)
    const generateHeatmapData = () => {
        const data = [];
        const today = new Date();
        const numDays = 180; // approx 6 months

        for (let i = numDays; i >= 0; i--) {
            const date = subDays(today, i);
            // Higher chance of level 0 (no activity) or level 1 (low), some high activity
            const random = Math.random();
            let level = 0;
            if (random > 0.4 && random <= 0.7) level = 1;
            else if (random > 0.7 && random <= 0.85) level = 2;
            else if (random > 0.85 && random <= 0.95) level = 3;
            else if (random > 0.95) level = 4;

            data.push({
                date: format(date, "yyyy-MM-dd"),
                count: level * 3, // mock count based on level
                level: level,
            });
        }
        return data;
    };

    // Theme for the activity calendar (matching our Cyan/Indigo glassy aesthetic)
    const explicitTheme = {
        light: ['#27272a', '#1e3a8a', '#1d4ed8', '#4338ca', '#22d3ee'],
        dark: ['rgba(255,255,255,0.05)', 'rgba(34, 211, 238, 0.2)', 'rgba(34, 211, 238, 0.4)', 'rgba(34, 211, 238, 0.7)', '#22d3ee'],
    };

    return (
        <>
            {/* ===== PAGE HEADER ===== */}
            <header className="anim-fade-in-up" style={{ marginBottom: 40 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                        <h1 style={{ fontSize: 28, fontWeight: 800, color: "#fafafa", letterSpacing: "-0.03em", margin: 0 }}>
                            Profile & Settings
                        </h1>
                        <p style={{ fontSize: 14, color: "#52525b", marginTop: 4 }}>
                            Manage your account and focus preferences
                        </p>
                    </div>
                    <Link to="/" className="btn-secondary">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M19 12H5" />
                            <polyline points="12 19 5 12 12 5" />
                        </svg>
                        Dashboard
                    </Link>
                </div>
            </header>

            {/* ===== PROFILE HERO CARD ===== */}
            <section className="anim-fade-in-up anim-delay-1" style={{ marginBottom: 48 }}>
                <div
                    className="glass-card-static"
                    style={{
                        padding: 0,
                        overflow: "hidden",
                    }}
                >
                    {/* Gradient top strip */}
                    <div
                        style={{
                            height: 100,
                            background: "linear-gradient(135deg, rgba(34,211,238,0.15) 0%, rgba(99,102,241,0.12) 50%, rgba(139,92,246,0.1) 100%)",
                            position: "relative",
                        }}
                    >
                        <div
                            style={{
                                position: "absolute",
                                inset: 0,
                                background: "radial-gradient(ellipse at 30% 100%, rgba(34,211,238,0.08), transparent 60%)",
                            }}
                        />
                    </div>

                    <div style={{ padding: "0 32px 32px", marginTop: -48 }}>
                        {/* Avatar + Actions */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
                            <div style={{ display: "flex", alignItems: "flex-end", gap: 20 }}>
                                {/* Avatar with gradient ring */}
                                <div style={{ position: "relative" }}>
                                    <div
                                        style={{
                                            width: 96,
                                            height: 96,
                                            borderRadius: 20,
                                            padding: 3,
                                            background: "linear-gradient(135deg, #22d3ee, #6366f1)",
                                            flexShrink: 0,
                                        }}
                                    >
                                        <img
                                            src={user.image}
                                            alt="Profile"
                                            style={{
                                                width: "100%",
                                                height: "100%",
                                                borderRadius: 17,
                                                objectFit: "cover",
                                                display: "block",
                                            }}
                                        />
                                    </div>
                                    {/* Online indicator */}
                                    <span
                                        style={{
                                            position: "absolute",
                                            bottom: 4,
                                            right: 4,
                                            width: 14,
                                            height: 14,
                                            borderRadius: "50%",
                                            background: "#34d399",
                                            border: "3px solid #16161c",
                                            boxShadow: "0 0 8px rgba(52,211,153,0.5)",
                                        }}
                                    />
                                </div>

                                <div style={{ paddingBottom: 4 }}>
                                    {!isEditing ? (
                                        <>
                                            <h2 style={{ fontSize: 22, fontWeight: 800, color: "#fafafa", margin: 0, letterSpacing: "-0.02em" }}>
                                                {user.name}
                                            </h2>
                                            <p style={{ fontSize: 14, color: "#71717a", margin: 0, marginTop: 2 }}>
                                                {user.email}
                                            </p>
                                        </>
                                    ) : (
                                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                            <input
                                                type="text"
                                                name="name"
                                                value={user.name}
                                                onChange={handleChange}
                                                className="input-field"
                                                style={{ fontSize: 16, fontWeight: 700, width: 280 }}
                                            />
                                            <input
                                                type="email"
                                                name="email"
                                                value={user.email}
                                                onChange={handleChange}
                                                className="input-field"
                                                style={{ width: 280 }}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <button
                                onClick={() => setIsEditing(!isEditing)}
                                className={isEditing ? "btn-primary" : "btn-secondary"}
                            >
                                {isEditing ? (
                                    <>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                        Save Changes
                                    </>
                                ) : (
                                    <>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                        </svg>
                                        Edit Profile
                                    </>
                                )}
                            </button>
                        </div>

                        {/* Edit Image URL */}
                        {isEditing && (
                            <div style={{ marginBottom: 20 }}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: "#52525b", display: "block", marginBottom: 6 }}>
                                    Avatar URL
                                </label>
                                <input
                                    type="text"
                                    name="image"
                                    value={user.image}
                                    onChange={handleChange}
                                    placeholder="Paste image URL"
                                    className="input-field"
                                    style={{ maxWidth: 440 }}
                                />
                            </div>
                        )}

                        {/* Quick Stats Row */}
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(3, 1fr)",
                                gap: 12,
                                padding: 16,
                                background: "rgba(255,255,255,0.02)",
                                borderRadius: "var(--radius-lg)",
                                border: "1px solid rgba(255,255,255,0.04)",
                            }}
                        >
                            {stats.map((stat, i) => (
                                <div
                                    key={i}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 12,
                                        padding: "10px 14px",
                                        borderRadius: "var(--radius-md)",
                                    }}
                                >
                                    <span
                                        style={{
                                            width: 36,
                                            height: 36,
                                            borderRadius: 10,
                                            background: "rgba(34,211,238,0.06)",
                                            border: "1px solid rgba(34,211,238,0.1)",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            color: "#22d3ee",
                                            flexShrink: 0,
                                        }}
                                    >
                                        {stat.icon}
                                    </span>
                                    <div>
                                        <p style={{ fontSize: 20, fontWeight: 800, color: "#fafafa", margin: 0, letterSpacing: "-0.02em" }}>
                                            {stat.value}
                                        </p>
                                        <p style={{ fontSize: 12, color: "#52525b", margin: 0 }}>
                                            {stat.label}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* ===== ANALYTICS ===== */}
            <section className="anim-fade-in-up anim-delay-3" style={{ marginBottom: 48 }}>
                <h2 className="section-title">Analytics</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
                    {analytics.map((item, i) => {
                        const colorMap = {
                            cyan: { color: "#22d3ee", bg: "rgba(34,211,238,0.08)", border: "rgba(34,211,238,0.15)" },
                            amber: { color: "#fbbf24", bg: "rgba(251,191,36,0.08)", border: "rgba(251,191,36,0.15)" },
                            rose: { color: "#f43f5e", bg: "rgba(244,63,94,0.08)", border: "rgba(244,63,94,0.15)" },
                        };
                        const c = colorMap[item.accent] || colorMap.cyan;

                        return (
                            <div
                                key={i}
                                className={`glass-card anim-fade-in-up anim-delay-${i + 3}`}
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
                                        }}
                                    >
                                        {item.icon}
                                    </span>
                                    <span style={{ fontSize: 13, color: "#71717a", fontWeight: 500 }}>{item.label}</span>
                                </div>
                                <p style={{ fontSize: 24, fontWeight: 800, color: c.color, margin: 0, letterSpacing: "-0.02em" }}>
                                    {item.value}
                                </p>
                            </div>
                        );
                    })}

                    {/* Weekly Chart Card */}
                    <div
                        className="glass-card anim-fade-in-up anim-delay-6"
                        style={{ padding: "22px 24px", cursor: "default" }}
                    >
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                            <span
                                style={{
                                    width: 34,
                                    height: 34,
                                    borderRadius: 10,
                                    background: "rgba(59,130,246,0.08)",
                                    border: "1px solid rgba(59,130,246,0.15)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: "#3b82f6",
                                }}
                            >
                                <ChartIcon />
                            </span>
                            <span style={{ fontSize: 13, color: "#71717a", fontWeight: 500 }}>Weekly Performance</span>
                        </div>

                        {/* Bar Chart */}
                        <div
                            style={{
                                display: "flex",
                                alignItems: "flex-end",
                                justifyContent: "space-between",
                                gap: 6,
                                height: 100,
                                padding: "0 4px",
                            }}
                        >
                            {weeklyData.map((d, i) => (
                                <div
                                    key={i}
                                    style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        gap: 6,
                                        flex: 1,
                                    }}
                                >
                                    <div
                                        style={{
                                            width: "100%",
                                            maxWidth: 28,
                                            height: `${d.value}%`,
                                            borderRadius: 6,
                                            background: d.value >= 80
                                                ? "linear-gradient(180deg, #22d3ee, #3b82f6)"
                                                : d.value >= 60
                                                    ? "linear-gradient(180deg, #6366f1, #4f46e5)"
                                                    : "linear-gradient(180deg, #52525b, #3f3f46)",
                                            transformOrigin: "bottom",
                                            animation: `barGrow 0.6s ease ${i * 0.08}s both`,
                                            transition: "height 300ms ease",
                                        }}
                                    />
                                    <span style={{ fontSize: 10, color: "#52525b", fontWeight: 500 }}>
                                        {d.day}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* ===== ACTIVITY HEATMAP ===== */}
            <section className="anim-fade-in-up anim-delay-7" style={{ marginTop: 48, paddingBottom: 64 }}>
                <h2 className="section-title">Focus Activity</h2>

                <div
                    className="glass-card-static"
                    style={{
                        padding: "32px 24px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        overflowX: "auto",
                        overflowY: "hidden"
                    }}
                >
                    <div style={{ width: "100%", maxWidth: 850 }}>
                        <ActivityCalendar
                            data={generateHeatmapData()}
                            theme={explicitTheme}
                            colorScheme="dark"
                            blockSize={12}
                            blockMargin={4}
                            fontSize={12}
                            labels={{
                                legend: {
                                    less: "Less",
                                    more: "More"
                                },
                                months: [
                                    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
                                ],
                                totalCount: '{{count}} deep work sessions in the last 6 months',
                            }}
                            renderBlock={(block, activity) => {
                                // Newer react-activity-calendar versions pass color in block.props.style.backgroundColor
                                // Or we can rely squarely on our explicit theme and the activity level.
                                const levelColor = block?.color || explicitTheme.dark[activity.level] || "#22d3ee";

                                return (
                                    <div
                                        className="heatmap-block tooltip-trigger"
                                        style={{
                                            width: 12, height: 12,
                                            borderRadius: 2,
                                            backgroundColor: levelColor,
                                            transition: "all 0.2s ease",
                                            cursor: "pointer",
                                        }}
                                        key={activity.date}
                                        title={`${activity.count} sessions on ${activity.date}`}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.transform = "scale(1.2)";
                                            e.currentTarget.style.boxShadow = `0 0 8px ${levelColor}`;
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.transform = "scale(1)";
                                            e.currentTarget.style.boxShadow = "none";
                                        }}
                                    />
                                )
                            }}
                        />
                    </div>
                </div>
            </section>

            {/* ===== GOALS HISTORY ===== */}
            <section className="anim-fade-in-up anim-delay-5">
                <h2 className="section-title">Goals History</h2>

                <div style={{ position: "relative", paddingLeft: 24 }}>
                    {/* Timeline line */}
                    <div
                        style={{
                            position: "absolute",
                            left: 7,
                            top: 12,
                            bottom: 12,
                            width: 2,
                            background: "linear-gradient(180deg, rgba(34,211,238,0.3), rgba(99,102,241,0.1))",
                            borderRadius: 999,
                        }}
                    />

                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        {goals.map((goal, i) => {
                            const isComplete = goal.completion >= 80;
                            return (
                                <div
                                    key={goal.id}
                                    className={`glass-card-static anim-fade-in-up anim-delay-${i + 5}`}
                                    style={{
                                        padding: "22px 24px",
                                        position: "relative",
                                    }}
                                >
                                    {/* Timeline dot */}
                                    <div
                                        style={{
                                            position: "absolute",
                                            left: -24,
                                            top: 28,
                                            width: 14,
                                            height: 14,
                                            borderRadius: "50%",
                                            background: isComplete ? "#22d3ee" : "#6366f1",
                                            border: "3px solid #111114",
                                            boxShadow: `0 0 8px ${isComplete ? "rgba(34,211,238,0.3)" : "rgba(99,102,241,0.3)"}`,
                                        }}
                                    />

                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#fafafa", margin: 0 }}>
                                                {goal.name}
                                            </h3>
                                            <span
                                                className={`badge ${isComplete ? "badge-emerald" : "badge-amber"}`}
                                            >
                                                {isComplete ? "Completed" : "In Progress"}
                                            </span>
                                        </div>
                                        <span style={{ fontSize: 13, color: "#52525b", fontWeight: 500 }}>
                                            {goal.time}
                                        </span>
                                    </div>

                                    {/* Metrics Row */}
                                    <div style={{ display: "flex", gap: 20, marginBottom: 14 }}>
                                        <span style={{ fontSize: 13, color: "#71717a" }}>
                                            Completion: <strong style={{ color: "#e4e4e7" }}>{goal.completion}%</strong>
                                        </span>
                                        <span style={{ fontSize: 13, color: "#71717a" }}>
                                            Distractions:{" "}
                                            <strong
                                                style={{
                                                    color: goal.distractions > 4 ? "#f43f5e" : "#e4e4e7",
                                                }}
                                            >
                                                {goal.distractions}
                                            </strong>
                                        </span>
                                    </div>

                                    {/* Progress Bar */}
                                    <div className="progress-bar-track">
                                        <div
                                            className="progress-bar-fill"
                                            style={{
                                                width: `${goal.completion}%`,
                                                background: isComplete
                                                    ? "linear-gradient(90deg, #22d3ee, #34d399)"
                                                    : "linear-gradient(90deg, #6366f1, #8b5cf6)",
                                            }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>


        </>
    );
}

/* ============================
   SVG ICONS
   ============================ */
function GridIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
    );
}
function ClockIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
        </svg>
    );
}
function FireIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 22c-4.97 0-9-2.69-9-6 0-4 5-8 5-8s1 2 3 3c1.5.75 2.5 0 2.5 0s-1.5 2 0 4c1.5 2 4.5 1 4.5 1s1 2.5 1 4c0 3.31-3.13 6-7 6z" />
        </svg>
    );
}
function TimerIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="13" r="8" />
            <path d="M12 9v4l2 2" />
            <path d="M5 3L2 6" />
            <path d="M22 6l-3-3" />
            <path d="M12 5V3" />
        </svg>
    );
}
function AlertIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
    );
}
function SunsetIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M17 18a5 5 0 0 0-10 0" />
            <line x1="12" y1="9" x2="12" y2="2" />
            <line x1="4.22" y1="10.22" x2="5.64" y2="11.64" />
            <line x1="1" y1="18" x2="3" y2="18" />
            <line x1="21" y1="18" x2="23" y2="18" />
            <line x1="18.36" y1="11.64" x2="19.78" y2="10.22" />
            <line x1="23" y1="22" x2="1" y2="22" />
        </svg>
    );
}
function ChartIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
    );
}