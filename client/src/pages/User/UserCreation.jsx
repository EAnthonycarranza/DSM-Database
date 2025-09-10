import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";

// Simple signup page that creates both a Student and a User (role: student)
export default function UserCreation() {
	const { ready, authenticated, user } = useApp();
	const navigate = useNavigate();

	// Form state
	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [email, setEmail] = useState("");
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");

	// UI state
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [success, setSuccess] = useState(null); // { student, user }

	const isStudent = String(user?.role || "").toLowerCase() === "student";

	useEffect(() => {
		if (!ready) return;
		// If a student is already signed in, route to their dashboard
		if (authenticated && isStudent) {
			navigate("/dashboard", { replace: true });
		}
	}, [ready, authenticated, isStudent, navigate]);

	const validate = () => {
		if (!firstName.trim() || !lastName.trim()) return "First and last name are required.";
		const em = email.trim();
		if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return "Valid email is required.";
		if (!username.trim() || username.trim().length < 3) return "Username must be at least 3 characters.";
		if (!password || password.length < 6) return "Password must be at least 6 characters.";
		if (password !== confirm) return "Passwords do not match.";
		return null;
	};

	async function fetchJson(url, opts = {}) {
		const res = await fetch(url, {
			method: "GET",
			headers: { "Content-Type": "application/json", Accept: "application/json" },
			credentials: "include",
			...opts,
		});
		const ct = res.headers.get("content-type") || "";
		const body = ct.includes("application/json") ? await res.json() : await res.text();
		return { ok: res.ok, status: res.status, data: body };
	}

	const onSubmit = async (e) => {
		e?.preventDefault?.();
		setError("");
		setSuccess(null);
		const v = validate();
		if (v) {
			setError(v);
			return;
		}
		setLoading(true);

		// 1) Check duplicates for username/email
		try {
			const usersRes = await fetchJson("/api/users");
			if (usersRes.ok && Array.isArray(usersRes.data)) {
				const lowerU = username.trim().toLowerCase();
				const lowerE = email.trim().toLowerCase();
				const clash = usersRes.data.find(
					(u) => String(u.username || "").toLowerCase() === lowerU || String(u.email || "").toLowerCase() === lowerE
				);
				if (clash) {
					setLoading(false);
					setError("A user with that username or email already exists.");
					return;
				}
			}
		} catch {
			// Non-blocking: continue, server will still accept if unique
		}

		// 2) Create the student first
		let createdStudent = null;
		try {
			const body = {
				firstName: firstName.trim(),
				lastName: lastName.trim(),
				email: email.trim(),
				status: "Current",
				phase: "1",
				recordType: "Resident",
			};
			const r = await fetchJson("/api/students", { method: "POST", body: JSON.stringify(body) });
			if (!r.ok) {
				const msg = (r.data && (r.data.error || r.data.message)) || "Failed to create student";
				setLoading(false);
				setError(msg);
				return;
			}
			createdStudent = r.data;
		} catch (e) {
			setLoading(false);
			setError("Could not create student. Please try again.");
			return;
		}

		// 3) Create the user linked to that student
		try {
			const body = {
				name: `${firstName.trim()} ${lastName.trim()}`.trim(),
				username: username.trim(),
				email: email.trim(),
				password,
				role: "student",
				studentId: createdStudent.id,
			};
			const r = await fetchJson("/api/users", { method: "POST", body: JSON.stringify(body) });
			if (!r.ok) {
				// Attempt rollback: delete the student we just created
				try { await fetchJson(`/api/students/${createdStudent.id}`, { method: "DELETE" }); } catch {}
				const msg = (r.data && (r.data.error || r.data.message)) || "Failed to create user";
				setLoading(false);
				setError(msg);
				return;
			}
			setSuccess({ student: createdStudent, user: r.data });
			setLoading(false);
		} catch (e) {
			// Attempt rollback: delete the student we just created
			try { await fetchJson(`/api/students/${createdStudent.id}`, { method: "DELETE" }); } catch {}
			setLoading(false);
			setError("Could not create user. Please try again.");
		}
	};

	if (!ready) {
		return (
			<div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0b0f1d" }}>
				<div style={{ color: "#cbd5e1" }}>Loading…</div>
			</div>
		);
	}

	return (
		<div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(180deg,#0b0f1d,#0c1020 40%,#0a0e1b)", padding: 20 }}>
			<div style={{ width: "100%", maxWidth: 520, background: "#0f142a", border: "1px solid #1f294a", borderRadius: 18, boxShadow: "0 24px 60px rgba(0,0,0,.55)", padding: 28 }}>
				<div style={{ textAlign: "center", marginBottom: 20 }}>
					<div style={{ width: 64, height: 64, borderRadius: 14, margin: "0 auto 12px", display: "grid", placeItems: "center", background: "#22c55e", color: "#0b101e", fontWeight: 900 }}>DSM</div>
					<div style={{ color: "#e8ecf3", fontSize: 22, fontWeight: 800 }}>Create Your Account</div>
					<div style={{ color: "#9aa7c7", fontSize: 13 }}>Sign up to access your student dashboard</div>
				</div>

				{error && (
					<div style={{ background: "rgba(255,92,92,.12)", border: "1px solid rgba(255,92,92,.35)", color: "#ff9d9d", padding: "10px 12px", borderRadius: 10, marginBottom: 12, fontSize: 13 }}>{error}</div>
				)}

				{success ? (
					<div style={{ textAlign: "center" }}>
						<div style={{ color: "#b8ffcc", fontWeight: 800, marginBottom: 6 }}>Account created!</div>
						<div style={{ color: "#cfe0ff", fontSize: 14, marginBottom: 16 }}>
							Welcome {success.student?.firstName} {success.student?.lastName}. You can now sign in.
						</div>
						<div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
							<button onClick={() => navigate("/login", { replace: true })} style={{ height: 40, padding: "0 16px", borderRadius: 10, border: "none", background: "linear-gradient(180deg,#3f76ff,#315bff)", color: "#fff", fontWeight: 800, cursor: "pointer" }}>Go to Login</button>
						</div>
					</div>
				) : (
					<form onSubmit={onSubmit}>
						<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
							<div>
								<label style={{ display: "block", marginBottom: 6, color: "#cfe0ff", fontSize: 13, fontWeight: 600 }}>First name</label>
								<input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} required style={{ width: "100%", height: 44, background: "#0b1228", border: "1px solid #27325a", color: "#e8ecf3", borderRadius: 10, padding: "0 12px", outline: "none" }} />
							</div>
							<div>
								<label style={{ display: "block", marginBottom: 6, color: "#cfe0ff", fontSize: 13, fontWeight: 600 }}>Last name</label>
								<input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} required style={{ width: "100%", height: 44, background: "#0b1228", border: "1px solid #27325a", color: "#e8ecf3", borderRadius: 10, padding: "0 12px", outline: "none" }} />
							</div>
						</div>

						<div style={{ marginTop: 12 }}>
							<label style={{ display: "block", marginBottom: 6, color: "#cfe0ff", fontSize: 13, fontWeight: 600 }}>Email</label>
							<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required style={{ width: "100%", height: 44, background: "#0b1228", border: "1px solid #27325a", color: "#e8ecf3", borderRadius: 10, padding: "0 12px", outline: "none" }} />
						</div>

						<div style={{ marginTop: 12 }}>
							<label style={{ display: "block", marginBottom: 6, color: "#cfe0ff", fontSize: 13, fontWeight: 600 }}>Username</label>
							<input type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required style={{ width: "100%", height: 44, background: "#0b1228", border: "1px solid #27325a", color: "#e8ecf3", borderRadius: 10, padding: "0 12px", outline: "none" }} />
						</div>

						<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
							<div>
								<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
									<label style={{ color: "#cfe0ff", fontSize: 13, fontWeight: 600 }}>Password</label>
								</div>
								<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required style={{ width: "100%", height: 44, background: "#0b1228", border: "1px solid #27325a", color: "#e8ecf3", borderRadius: 10, padding: "0 12px", outline: "none" }} />
							</div>
							<div>
								<label style={{ display: "block", marginBottom: 6, color: "#cfe0ff", fontSize: 13, fontWeight: 600 }}>Confirm Password</label>
								<input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required style={{ width: "100%", height: 44, background: "#0b1228", border: "1px solid #27325a", color: "#e8ecf3", borderRadius: 10, padding: "0 12px", outline: "none" }} />
							</div>
						</div>

						<button type="submit" disabled={loading} style={{ width: "100%", height: 46, borderRadius: 10, border: "none", cursor: loading ? "default" : "pointer", background: loading ? "#2a3a78" : "linear-gradient(180deg,#22c55e,#16a34a)", color: "#0b101e", fontWeight: 900, marginTop: 14 }}>
							{loading ? "Creating…" : "Create Account"}
						</button>

						<div style={{ textAlign: "center", marginTop: 12 }}>
							<button type="button" onClick={() => navigate("/login")} style={{ height: 38, padding: "0 16px", borderRadius: 10, border: "1px solid #2a3763", background: "transparent", color: "#9aa7c7", cursor: "pointer" }}>
								Already have an account? Sign in
							</button>
						</div>
					</form>
				)}
			</div>
		</div>
	);
}

