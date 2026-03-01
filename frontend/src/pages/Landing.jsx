import { useAuth0 } from "@auth0/auth0-react";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

export default function Landing() {
    const { loginWithRedirect, isAuthenticated, isLoading } = useAuth0();
    const navigate = useNavigate();

    useEffect(() => {
        if (isAuthenticated) {
            navigate("/home");
        }
    }, [isAuthenticated, navigate]);

    if (isLoading) {
        return (
            <div
                style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    height: "100vh",
                    background: "var(--gradient-ethereal)",
                }}
            >
                <div style={{ textAlign: "center" }}>
                    <div
                        style={{
                            width: 40,
                            height: 40,
                            border: "3px solid #bfdbfe",
                            borderTopColor: "#3b82f6",
                            borderRadius: "50%",
                            animation: "spin 1s linear infinite",
                            margin: "0 auto 16px",
                        }}
                    />
                    <p style={{ fontSize: 14, color: "var(--text-muted)" }}>Loading...</p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--gradient-ethereal)" }}>
            <div
                className="glass-card anim-fade-in-up"
                style={{
                    padding: "60px 48px",
                    maxWidth: 540,
                    width: "100%",
                    textAlign: "center",
                    position: "relative",
                    overflow: "hidden"
                }}
            >
                {/* Decorative background shape */}
                <div style={{
                    position: "absolute", top: -100, left: -100, width: 300, height: 300,
                    borderRadius: "50%", background: "var(--accent-light-blue)", filter: "blur(60px)", opacity: 0.5, zIndex: 0
                }} />

                <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div className="pill-container" style={{ marginBottom: 24, padding: "12px 32px" }}>
                        <h1
                            style={{
                                fontSize: 36,
                                fontWeight: 800,
                                color: "var(--text-main)",
                                letterSpacing: "-0.04em",
                                margin: 0
                            }}
                        >
                            FlowState
                        </h1>
                    </div>

                    <p
                        style={{
                            fontSize: 16,
                            color: "var(--text-muted)",
                            marginBottom: 44,
                            lineHeight: 1.6,
                            fontWeight: 500
                        }}
                    >
                        Your AI partner for advanced<br />scientific discovery and deep focus.
                    </p>

                    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%", maxWidth: 300 }}>
                        <button
                            onClick={() => loginWithRedirect()}
                            className="btn-primary"
                            style={{
                                padding: "16px 24px",
                                fontSize: 16,
                                justifyContent: "center",
                                width: "100%"
                            }}
                        >
                            Login / Sign Up
                        </button>
                    </div>

                    <div
                        style={{
                            marginTop: 40,
                            fontSize: 14,
                            color: "var(--text-muted)",
                            fontWeight: 500
                        }}
                    >
                        The world's best focus manager
                    </div>
                </div>
            </div>
        </div>
    );
}