import PlannerIcon from "./PlannerIcon";

export default function AuthPortal({ error, authNotice, authMode, authForm, resetForm, resetCodeSent,
  onAuthSubmit, onAuthFormChange, onResetPasswordSubmit, onResetFormChange, onRequestPasswordResetCode, onChangeMode }) {
  return (
    <div className="page auth-page">
      <header className="topbar">
        <h1 className="planner-brand"><PlannerIcon name="compass" />Family Travel Log</h1>
      </header>
      {error ? <p className="error">{error}</p> : null}
      {authNotice ? <p className="helper-text">{authNotice}</p> : null}
      <main className="auth-wrap">
        <section className="auth-intro" aria-label="Your family travel planner"><p className="eyebrow">Your family travel planner</p><h2>Great trips start<br />with a good plan.</h2><p>Keep your itinerary, favorite places, and travel companions together.</p><img src="/images/planner-cover.jpg" alt="" width="1200" height="675" /></section>
        <section className="panel auth-panel">
          <p className="eyebrow">{authMode === "login" ? "Welcome back" : authMode === "register" ? "Let's get started" : "Account recovery"}</p>
          <h2>{authMode === "reset" ? "Reset Password" : authMode === "login" ? "Sign In" : "Create Account"}</h2>
          {authMode !== "reset" ? (
            <>
              <form className="trip-form" onSubmit={onAuthSubmit}>
                <label>
                  User ID
                  <input value={authForm.user_id} onChange={onAuthFormChange("user_id")} required />
                </label>
                {authMode === "register" ? (
                  <label>
                    Email
                    <input
                      type="email"
                      value={authForm.email}
                      onChange={onAuthFormChange("email")}
                      placeholder="you@example.com"
                      required
                    />
                  </label>
                ) : null}
                <label>
                  Password
                  <input
                    type="password"
                    value={authForm.password}
                    onChange={onAuthFormChange("password")}
                    minLength={8}
                    required
                  />
                </label>
                {authMode === "register" ? (
                  <label>
                    Confirm Password
                    <input
                      type="password"
                      value={authForm.confirm_password}
                      onChange={onAuthFormChange("confirm_password")}
                      minLength={8}
                      required
                    />
                  </label>
                ) : null}
                <button type="submit">{authMode === "login" ? "Log In" : "Create Account"}</button>
              </form>
              <p className="helper-text">
                {authMode === "login" ? "Need a new account?" : "Already have an account?"}{" "}
                <button
                  type="button"
                  className="link-button"
                  onClick={() => onChangeMode(authMode === "login" ? "register" : "login")}
                >
                  {authMode === "login" ? "Create one" : "Log in"}
                </button>
              </p>
              {authMode === "login" ? (
                <p className="helper-text">
                  Forgot your password?{" "}
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => onChangeMode("reset")}
                  >
                    Reset it
                  </button>
                </p>
              ) : null}
            </>
          ) : (
            <>
              <form className="trip-form" onSubmit={onResetPasswordSubmit}>
                <label>
                  User ID
                  <input value={resetForm.user_id} onChange={onResetFormChange("user_id")} required />
                </label>
                <div className="action-row">
                  <button type="button" onClick={onRequestPasswordResetCode}>
                    Send Verification Code
                  </button>
                </div>
                <label>
                  Email Verification Code
                  <input
                    value={resetForm.email_code}
                    onChange={onResetFormChange("email_code")}
                    placeholder="6-digit code"
                    required
                  />
                </label>
                {resetCodeSent ? (
                  <p className="helper-text">
                    Check your email for the verification code, then enter it below.
                  </p>
                ) : null}
                <label>
                  New Password
                  <input
                    type="password"
                    value={resetForm.new_password}
                    onChange={onResetFormChange("new_password")}
                    minLength={8}
                    required
                  />
                </label>
                <label>
                  Confirm New Password
                  <input
                    type="password"
                    value={resetForm.confirm_password}
                    onChange={onResetFormChange("confirm_password")}
                    minLength={8}
                    required
                  />
                </label>
                <button type="submit">Reset Password</button>
              </form>
              <p className="helper-text">
                Remembered your password?{" "}
                <button
                  type="button"
                  className="link-button"
                  onClick={() => onChangeMode("login")}
                >
                  Back to log in
                </button>
              </p>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
