import { Link } from "react-router-dom";

export default function Landing() {
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
                FocusFlow
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
                <Link
                    to="/login"
                    className="btn-primary"
                    style={{
                        padding: "14px 20px",
                        fontSize: 15,
                        justifyContent: "center",
                    }}
                >
                    Login
                </Link>

                <Link
                    to="/signup"
                    className="btn-secondary"
                    style={{
                        padding: "14px 20px",
                        fontSize: 15,
                        justifyContent: "center",
                    }}
                >
                    Create Account
                </Link>
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