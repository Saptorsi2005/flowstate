import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";

export default function Login() {
    const navigate = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const handleSubmit = (e) => {
        e.preventDefault();
        navigate("/home");
    };

    return (
        <div
            className="glass-card"
            style={{
                padding: 45,
                maxWidth: 420,
                width: "100%",
            }}
        >
            <h1
                style={{
                    fontSize: 28,
                    fontWeight: 800,
                    color: "#fafafa",
                    marginBottom: 25,
                }}
            >
                Welcome Back
            </h1>

            <form
                onSubmit={handleSubmit}
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                }}
            >
                <input
                    type="email"
                    required
                    className="input-field"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                />

                <input
                    type="password"
                    required
                    className="input-field"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />

                <button
                    type="submit"
                    className="btn-primary"
                    style={{ padding: 12 }}
                >
                    Login
                </button>
            </form>

            <p
                style={{
                    marginTop: 20,
                    fontSize: 13,
                    color: "#71717a",
                    textAlign: "center",
                }}
            >
                Don’t have an account?{" "}
                <Link to="/signup" style={{ color: "#22d3ee" }}>
                    Sign up
                </Link>
            </p>
        </div>
    );
}