// src/layouts/AppLayout.jsx
import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";

export default function AppLayout() {
    return (
        <div className="page-layout" style={{ minHeight: "100vh" }}>
            <Sidebar />

            <div className="ambient-glow ambient-glow-1" />
            <div className="ambient-glow ambient-glow-2" />

            <main className="page-content">
                <Outlet />
            </main>
        </div>
    );
}