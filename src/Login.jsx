import { useState } from "react";

const VIEW_CODE = import.meta.env.VITE_ACCESS_CODE || "Bawaba";
const ADMIN_CODE = import.meta.env.VITE_ADMIN_ACCESS_CODE || "adminbawaba";

export default function Login({ onSuccess }) {
  const [mode, setMode] = useState("viewer");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function switchMode(next) {
    setMode(next);
    setError("");
  }

  function handleViewerSubmit(e) {
    e.preventDefault();
    if (code.trim() === VIEW_CODE) {
      onSuccess("viewer");
    } else {
      setError("Foute code, probeer opnieuw");
    }
  }

  function handleAdminSubmit(e) {
    e.preventDefault();
    if (password === ADMIN_CODE) {
      onSuccess("admin");
    } else {
      setError("Foute code, probeer opnieuw");
    }
  }

  if (mode === "admin") {
    return (
      <div className="login-screen">
        <form className="login-box" onSubmit={handleAdminSubmit}>
          <h1>Beheerder inloggen</h1>
          <p className="hint">Voer de beheerderscode in</p>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            placeholder="Beheerderscode"
          />
          {error && <p className="warning">{error}</p>}
          <button type="submit" className="save-btn">Inloggen</button>
          <button type="button" className="login-switch" onClick={() => switchMode("viewer")}>
            ← Terug naar normale login
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <form className="login-box" onSubmit={handleViewerSubmit}>
        <h1>Adviseurs regiokaart</h1>
        <p className="hint">Voer de toegangscode in</p>
        <input
          type="password"
          autoFocus
          value={code}
          onChange={(e) => { setCode(e.target.value); setError(""); }}
          placeholder="Toegangscode"
        />
        {error && <p className="warning">{error}</p>}
        <button type="submit" className="save-btn">Openen</button>
        <button type="button" className="login-switch" onClick={() => switchMode("admin")}>
          Ben je beheerder? Log hier in →
        </button>
      </form>
    </div>
  );
}
