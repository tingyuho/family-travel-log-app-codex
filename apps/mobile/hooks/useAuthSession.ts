import { useState } from "react";

import { getAuthState } from "../api";
import { emptyResetForm, type AuthMode, type ResetForm } from "../forms";

export function useAuthSession() {
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [sessionUser, setSessionUser] = useState(getAuthState().userId);
  const [profileEmail, setProfileEmail] = useState("");
  const [profileResetForm, setProfileResetForm] = useState<ResetForm>({
    ...emptyResetForm,
    user_id: getAuthState().userId,
  });
  const [profileResetCodeSent, setProfileResetCodeSent] = useState(false);
  const [resetForm, setResetForm] = useState<ResetForm>(emptyResetForm);
  const [resetCodeSent, setResetCodeSent] = useState(false);

  return {
    authMode,
    setAuthMode,
    userId,
    setUserId,
    email,
    setEmail,
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    sessionUser,
    setSessionUser,
    profileEmail,
    setProfileEmail,
    profileResetForm,
    setProfileResetForm,
    profileResetCodeSent,
    setProfileResetCodeSent,
    resetForm,
    setResetForm,
    resetCodeSent,
    setResetCodeSent,
  };
}
