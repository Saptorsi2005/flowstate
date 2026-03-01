import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { ActivityCalendar } from "react-activity-calendar";
import { subDays, format } from "date-fns";

const API_URL = import.meta.env.VITE_API_URL || 'https://your-backend.vercel.app';

export default function Profile() {
    const { getAccessTokenSilently, user: auth0User, logout } = useAuth0();
    const [profileData, setProfileData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        async function fetchProfile() {
            try {
                const token = await getAccessTokenSilently();
                const response = await fetch(`${API_URL}/api/profile`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                    },
                });
                
                if (!response.ok) {
                    throw new Error('Failed to fetch profile');
                }
                
                const data = await response.json();
                setProfileData(data);
            } catch (err) {
                console.error('Profile fetch error:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        
        fetchProfile();
    }, [getAccessTokenSilently]);

    const stats = profileData ? [
        { label: "Workspaces", value: profileData.stats.totalWorkspaces, icon: <GridIcon /> },
        { label: "Hours Focused", value: `${profileData.stats.totalDeepWorkHours}h`, icon: <ClockIcon /> },
        { label: "Day Streak", value: profileData.stats.currentStreak, icon: <FireIcon /> },
    ] : [];

    // Generate mock heatmap data (last 6 months)
    const generateHeatmapData = () => {
        const data = [];
        const today = new Date();
        const numDays = 180;

        for (let i = numDays; i >= 0; i--) {
            const date = subDays(today, i);
            const random = Math.random();
            let level = 0;
            if (random > 0.4 && random <= 0.7) level = 1;
            else if (random > 0.7 && random <= 0.85) level = 2;
            else if (random > 0.85 && random <= 0.95) level = 3;
            else if (random > 0.95) level = 4;

            data.push({
                date: format(date, "yyyy-MM-dd"),
                count: level * 3,
                level: level,
            });
        }
        return data;
    };

    const explicitTheme = {
        light: ['#27272a', '#1e3a8a', '#1d4ed8', '#4338ca', '#22d3ee'],
        dark: ['rgba(255,255,255,0.05)', 'rgba(34, 211, 238, 0.2)', 'rgba(34, 211, 238, 0.4)', 'rgba(34, 211, 238, 0.7)', '#22d3ee'],
    };

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
                    <p style={{ fontSize: 14, color: "#71717a" }}>Loading profile...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ textAlign: 'center', padding: 40, color: '#71717a' }}>
                <p>Error loading profile: {error}</p>
                <button onClick={() => window.location.reload()} className="btn-primary" style={{ marginTop: 20 }}>
                    Retry
                </button>
            </div>
        );
    }

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
                    <Link to="/home" className="btn-secondary">
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

                    <div style={{ padding: "0 32px 32px" }}>
                        <div
                            style={{
                                marginTop: -40,
                                display: "flex",
                                alignItems: "flex-end",
                                justifyContent: "space-between",
                            }}
                        >
                            <div style={{ display: "flex", alignItems: "flex-end", gap: 20 }}>
                                <div
                                    style={{
                                        width: 90,
                                        height: 90,
                                        borderRadius: 16,
                                        background: "linear-gradient(135deg, #22d3ee 0%, #6366f1 100%)",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontSize: 32,
                                        fontWeight: 700,
                                        color: "#fff",
                                        border: "4px solid rgba(24,24,27,0.95)",
                                    }}
                                >
                                    {profileData?.user?.name?.charAt(0) || auth0User?.name?.charAt(0) || '?'}
                                </div>
                                <div style={{ paddingBottom: 8 }}>
                                    <h2 style={{ fontSize: 22, fontWeight: 700, color: "#fafafa", margin: 0 }}>
                                        {profileData?.user?.name || auth0User?.name || 'User'}
                                    </h2>
                                    <p style={{ fontSize: 14, color: "#71717a", marginTop: 4 }}>
                                        {profileData?.user?.email || auth0User?.email}
                                    </p>
                                </div>
                            </div>

                            <button
                                onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
                                className="btn-secondary"
                                style={{ marginBottom: 8 }}
                            >
                                Logout
                            </button>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 28 }}>
                            {stats.map((stat, i) => (
                                <div
                                    key={i}
                                    style={{
                                        padding: 20,
                                        borderRadius: 12,
                                        background: "rgba(255,255,255,0.03)",
                                        border: "1px solid rgba(255,255,255,0.06)",
                                    }}
                                >
                                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                                        <div style={{ color: "#22d3ee", opacity: 0.7 }}>{stat.icon}</div>
                                        <span style={{ fontSize: 13, color: "#71717a", fontWeight: 500 }}>
                                            {stat.label}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: 28, fontWeight: 700, color: "#fafafa" }}>
                                        {stat.value}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* ===== TODAY'S FOCUS SCORE ===== */}
            <section className="anim-fade-in-up anim-delay-2" style={{ marginBottom: 48 }}>
                <h2 className="section-title">Today's Focus</h2>
                <div className="glass-card-static" style={{ padding: 32 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                        <div>
                            <h3 style={{ fontSize: 16, fontWeight: 600, color: "#fafafa", margin: 0 }}>
                                Focus Score
                            </h3>
                            <p style={{ fontSize: 13, color: "#71717a", marginTop: 4 }}>
                                Your productivity score for today
                            </p>
                        </div>
                        <div
                            style={{
                                fontSize: 48,
                                fontWeight: 800,
                                background: "linear-gradient(135deg, #22d3ee 0%, #6366f1 100%)",
                                WebkitBackgroundClip: "text",
                                WebkitTextFillColor: "transparent",
                                backgroundClip: "text",
                            }}
                        >
                            {profileData?.stats?.todayFocusScore || 0}
                        </div>
                    </div>
                    <div
                        style={{
                            height: 8,
                            borderRadius: 8,
                            background: "rgba(255,255,255,0.05)",
                            overflow: "hidden",
                        }}
                    >
                        <div
                            style={{
                                height: "100%",
                                width: `${profileData?.stats?.todayFocusScore || 0}%`,
                                background: "linear-gradient(90deg, #22d3ee 0%, #6366f1 100%)",
                                borderRadius: 8,
                                transition: "width 0.5s ease",
                            }}
                        />
                    </div>
                </div>
            </section>

            {/* ===== ACTIVITY HEATMAP ===== */}
            <section className="anim-fade-in-up anim-delay-3" style={{ marginBottom: 48 }}>
                <h2 className="section-title">Activity History</h2>
                <div className="glass-card-static" style={{ padding: 32 }}>
                    <ActivityCalendar
                        data={generateHeatmapData()}
                        theme={explicitTheme}
                        blockSize={12}
                        blockMargin={4}
                        fontSize={12}
                        hideColorLegend
                        showWeekdayLabels
                    />
                </div>
            </section>
        </>
    );
}

// Icons
function GridIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
        </svg>
    );
}

function ClockIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
        </svg>
    );
}

function FireIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C12 2 7 6 7 11C7 14.31 9.69 17 13 17C16.31 17 19 14.31 19 11C19 6 14 2 14 2C14 2 14.5 4.5 12 7C9.5 4.5 12 2 12 2Z" />
            <path d="M10.5 20C10.5 20 9 18.5 9 17C9 15.62 10.12 14.5 11.5 14.5C12.88 14.5 14 15.62 14 17C14 18.5 12.5 20 12.5 20C12.5 20 12.75 19 11.5 18C10.25 19 10.5 20 10.5 20Z" />
        </svg>
    );
}
