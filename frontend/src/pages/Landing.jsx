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
                    background: "linear-gradient(135deg, #09090b 0%, #18181b 100%)",
                }}
            >
                <div style={{ textAlign: "center" }}>
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
                    <p style={{ fontSize: 14, color: "#71717a" }}>Loading...</p>
                </div>
            </div>
        );
    }

    return (
        <div
            className="glass-card anim-fade-in-up"
            style={{
                padding: "60px 50px",
                maxWidth: 480,
                width: "100%",
                textAlign: "center",
            }}
        >
            <h1
                style={{
                    fontSize: 36,
                    fontWeight: 800,
                    color: "#fafafa",
                    letterSpacing: "-0.04em",
                    marginBottom: 12,
                }}
            >
                FlowState
            </h1>

            <p
                style={{
                    fontSize: 15,
                    color: "#71717a",
                    marginBottom: 40,
                    lineHeight: 1.6,
                }}
            >
                Structure your deep work. Eliminate distractions.
                Build consistency.
            </p>

            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                }}
            >
                <button
                    onClick={() => loginWithRedirect()}
                    className="btn-primary"
                    style={{
                        padding: "14px 20px",
                        fontSize: 15,
                        justifyContent: "center",
                    }}
                >
                    Login / Sign Up
                </button>
            </div>

            <div
                style={{
                    marginTop: 40,
                    fontSize: 13,
                    color: "#52525b",
                }}
            >
                Stay consistent. Track progress. Improve daily.
            </div>
        </div>
    );
}