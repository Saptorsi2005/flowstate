import { Link, useLocation } from "react-router-dom";

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

    return (
        <aside style={styles.sidebar}>
            {/* Brand */}
            <div style={styles.brand}>
                <div style={styles.brandIcon}>
                    <img
                        src="/flowstate-logo.png"
                        alt="FlowState Logo"
                        style={{
                            width: 36,
                            height: 36,
                            borderRadius: 8,
                            objectFit: "cover",
                        }}
                    />
                </div>
                <div>
                    <h1 style={styles.brandTitle}>FlowState</h1>
                    <span style={styles.brandSub}>AI Tab Manager</span>
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
                                    e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                                    e.currentTarget.style.color = "#e4e4e7";
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isActive) {
                                    e.currentTarget.style.background = "transparent";
                                    e.currentTarget.style.color = "#71717a";
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

            {/* User Card */}
            <div style={styles.userCard}>
                <img
                    src="https://i.pravatar.cc/150?img=3"
                    alt="User"
                    style={styles.userAvatar}
                />
                <div>
                    <p style={styles.userName}>Pritam B.</p>
                    <p style={styles.userStatus}>
                        <span style={styles.onlineDot} />
                        Online
                    </p>
                </div>
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
        background: "rgba(12, 12, 18, 0.85)",
        backdropFilter: "blur(24px)",
        borderRight: "1px solid rgba(255,255,255,0.06)",
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
        background: "rgba(34, 211, 238, 0.08)",
        border: "1px solid rgba(34, 211, 238, 0.15)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
    },
    brandTitle: {
        fontSize: "17px",
        fontWeight: 800,
        color: "#fafafa",
        letterSpacing: "-0.03em",
        lineHeight: 1.2,
        margin: 0,
    },
    brandSub: {
        fontSize: "11px",
        color: "#52525b",
        fontWeight: 500,
        letterSpacing: "0.02em",
    },
    nav: {
        display: "flex",
        flexDirection: "column",
        gap: "4px",
    },
    navLabel: {
        fontSize: "10px",
        fontWeight: 700,
        color: "#3f3f46",
        letterSpacing: "0.1em",
        padding: "0 12px",
        marginBottom: "8px",
    },
    navItem: {
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "10px 12px",
        borderRadius: "10px",
        color: "#71717a",
        textDecoration: "none",
        fontSize: "14px",
        fontWeight: 500,
        transition: "all 200ms ease",
        position: "relative",
    },
    navItemActive: {
        background: "rgba(34, 211, 238, 0.08)",
        color: "#22d3ee",
    },
    navIcon: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "32px",
        height: "32px",
        borderRadius: "8px",
        background: "rgba(255,255,255,0.03)",
        flexShrink: 0,
    },
    navIconActive: {
        background: "rgba(34, 211, 238, 0.12)",
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
        background: "linear-gradient(180deg, #22d3ee, #6366f1)",
    },
    userCard: {
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "14px 12px",
        background: "rgba(255,255,255,0.03)",
        borderRadius: "12px",
        border: "1px solid rgba(255,255,255,0.05)",
    },
    userAvatar: {
        width: "36px",
        height: "36px",
        borderRadius: "10px",
        objectFit: "cover",
        flexShrink: 0,
    },
    userName: {
        fontSize: "13px",
        fontWeight: 600,
        color: "#e4e4e7",
        margin: 0,
        lineHeight: 1.3,
    },
    userStatus: {
        fontSize: "11px",
        color: "#52525b",
        margin: 0,
        display: "flex",
        alignItems: "center",
        gap: "5px",
    },
    onlineDot: {
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        background: "#34d399",
        boxShadow: "0 0 6px rgba(52, 211, 153, 0.5)",
        display: "inline-block",
    },
};
