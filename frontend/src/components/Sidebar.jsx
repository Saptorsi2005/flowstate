import { Link, useLocation } from "react-router-dom";
import { useAuth0 } from "@auth0/auth0-react";
import { useTheme } from "../contexts/ThemeContext";

const navItems = [
    {
        path: "/home",
        label: "Dashboard",
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
        ),
    },
    {
        path: "/profile",
        label: "Profile",
        icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M20 21a8 8 0 0 0-16 0" />
            </svg>
        ),
    },
];

export default function Sidebar() {
    const location = useLocation();
    const { user, logout } = useAuth0();
    const { theme, toggleTheme } = useTheme();

    const getUserInitials = (name) => {
        if (!name) return '?';
        const parts = name.split(' ');
        if (parts.length >= 2) {
            return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
        }
        return name[0].toUpperCase();
    };

    return (
        <aside style={styles.sidebar}>
            {/* Brand */}
            <div style={styles.brand}>
                <div style={{ ...styles.brandIcon, padding: 0, overflow: "hidden" }}>
                    <img
                        src="/flowstate-icon.png"
                        alt="FlowState Logo"
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                </div>
                <div>
                    <h1 style={styles.brandTitle}>FlowState</h1>
                    <span style={styles.brandSub}>Focus Manager</span>
                </div>
            </div>

            {/* Navigation */}
            <nav style={styles.nav}>
                <span style={styles.navLabel}>MENU</span>
                {navItems.map((item) => {
                    const isActive = location.pathname === item.path;
                    return (
                        <Link
                            key={item.path}
                            to={item.path}
                            style={{
                                ...styles.navItem,
                                ...(isActive ? styles.navItemActive : {}),
                            }}
                            onMouseEnter={(e) => {
                                if (!isActive) {
                                    e.currentTarget.style.background = "var(--bg-secondary)";
                                    e.currentTarget.style.color = "var(--text-main)";
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isActive) {
                                    e.currentTarget.style.background = "transparent";
                                    e.currentTarget.style.color = "var(--text-muted)";
                                }
                            }}
                        >
                            <span style={{
                                ...styles.navIcon,
                                ...(isActive ? styles.navIconActive : {}),
                            }}>
                                {item.icon}
                            </span>
                            <span style={styles.navText}>{item.label}</span>
                            {isActive && <span style={styles.activeIndicator} />}
                        </Link>
                    );
                })}
            </nav>

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Theme Toggle */}
            <div style={{ padding: "0 12px", marginBottom: "20px" }}>
                <button
                    onClick={toggleTheme}
                    style={{
                        ...styles.navItem,
                        width: "100%",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border-subtle)"
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <span style={styles.navIcon}>
                            {theme === "dark" ? "☀️" : "🌙"}
                        </span>
                        <span style={styles.navText}>
                            {theme === "dark" ? "Light Mode" : "Dark Mode"}
                        </span>
                    </div>
                </button>
            </div>

            {/* User Card */}
            <div style={styles.userCard}>
                <div
                    style={{
                        ...styles.userAvatar,
                        background: "var(--accent-blue)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "13px",
                        fontWeight: 700,
                        color: "#fff",
                    }}
                >
                    {getUserInitials(user?.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={styles.userName}>
                        {user?.name?.split(' ')[0] || 'User'}
                    </p>
                    <p style={styles.userStatus}>
                        <span style={styles.onlineDot} />
                        Online
                    </p>
                </div>
                <button
                    onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
                    style={{
                        background: "transparent",
                        border: "none",
                        color: "#71717a",
                        cursor: "pointer",
                        padding: 4,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 6,
                        transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#fee2e2";
                        e.currentTarget.style.color = "#ef4444";
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = "var(--text-muted)";
                    }}
                    title="Logout"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                </button>
            </div>
        </aside>
    );
}

const styles = {
    sidebar: {
        position: "fixed",
        top: 0,
        left: 0,
        width: "var(--sidebar-width)",
        height: "100vh",
        background: "var(--sidebar-bg)",
        backdropFilter: "blur(24px)",
        borderRight: "1px solid var(--border-subtle)",
        display: "flex",
        flexDirection: "column",
        padding: "28px 16px 20px",
        zIndex: 100,
        overflow: "hidden",
    },
    brand: {
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "0 8px",
        marginBottom: "36px",
    },
    brandIcon: {
        width: "40px",
        height: "40px",
        borderRadius: "12px",
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-subtle)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    brandTitle: {
        fontSize: "17px",
        fontWeight: 800,
        color: "var(--text-main)",
        letterSpacing: "-0.03em",
        lineHeight: 1.2,
        margin: 0,
    },
    brandSub: {
        fontSize: "12px",
        color: "var(--text-muted)",
        fontWeight: 500,
        letterSpacing: "0.02em",
    },
    nav: {
        display: "flex",
        flexDirection: "column",
        gap: "4px",
    },
    navLabel: {
        fontSize: "11px",
        fontWeight: 700,
        color: "var(--text-muted)",
        letterSpacing: "0.1em",
        padding: "0 12px",
        marginBottom: "8px",
    },
    navItem: {
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "10px 12px",
        borderRadius: "12px",
        color: "var(--text-muted)",
        textDecoration: "none",
        fontSize: "14px",
        fontWeight: 500,
        transition: "all 200ms ease",
        position: "relative",
    },
    navItemActive: {
        background: "var(--sidebar-nav-active)",
        color: "var(--sidebar-text-active)",
    },
    navIcon: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "32px",
        height: "32px",
        borderRadius: "8px",
        background: "transparent",
        flexShrink: 0,
    },
    navIconActive: {
        background: "var(--sidebar-icon-active)",
    },
    navText: {
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },
    activeIndicator: {
        position: "absolute",
        right: "0",
        width: "3px",
        height: "20px",
        borderRadius: "999px",
        background: "var(--accent-cyan)",
    },
    userCard: {
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "14px 12px",
        background: "var(--bg-secondary)",
        borderRadius: "16px",
        border: "1px solid var(--border-subtle)",
    },
    userAvatar: {
        width: "36px",
        height: "36px",
        borderRadius: "10px",
        objectFit: "cover",
        flexShrink: 0,
    },
    userName: {
        fontSize: "14px",
        fontWeight: 600,
        color: "var(--text-main)",
        margin: 0,
        lineHeight: 1.3,
    },
    userStatus: {
        fontSize: "12px",
        color: "var(--text-muted)",
        margin: 0,
        display: "flex",
        alignItems: "center",
        gap: "5px",
    },
    onlineDot: {
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        background: "var(--accent-emerald)",
        boxShadow: "0 0 6px rgba(16, 185, 129, 0.4)",
        display: "inline-block",
    },
};
