import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";

export default function Signup() {
    const navigate = useNavigate();
    const [name, setName] = useState("");
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
                Create Account
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
                    type="text"
                    required
                    className="input-field"
                    placeholder="Full Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />

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
                    Create Account
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
                Already have an account?{" "}
                <Link to="/login" style={{ color: "#22d3ee" }}>
                    Login
                </Link>
            </p>
        </div>
    );
}