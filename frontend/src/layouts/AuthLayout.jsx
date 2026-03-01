import { Outlet } from "react-router-dom";

export default function AuthLayout() {
    return (
        <div
            style={{
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                background: "var(--bg-primary)",
            }}
        >
            {/* Ambient Background */}
            <div className="ambient-glow ambient-glow-1" />
            <div className="ambient-glow ambient-glow-2" />

            {/* Render auth pages */}
            <Outlet />
        </div>
    );
}