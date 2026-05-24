import { useParams, useNavigate } from "react-router";
import { FormEvent, useEffect, useState } from "react";
import { Loader2, Check, X } from "lucide-react";
import { FormattedMessage, useIntl } from "react-intl";
import { RootState } from "@/store";
import { useDispatch, useSelector } from "react-redux";
import { login, User } from "@/store/userStore";
import { Alert, Box, Button, CircularProgress, Container, Paper, TextField, Typography } from "@mui/material";

type VerifyResponse = {
  success?: boolean;
  message?: string;
  user?: Partial<User>;
};

type SendCodeResponse = {
  success?: boolean;
  message?: string;
  expiresInMinutes?: number;
};

type VerifyProps = {
  embedded?: boolean;
  initialCodeSent?: boolean;
  initialCodeExpiresInMinutes?: number;
  successRedirectTo?: string;
};

export const AUTH_FORM_MAX_WIDTH = "524px";
export const AUTH_FORM_PAPER_SX = {
  width: "100%",
  maxWidth: AUTH_FORM_MAX_WIDTH,
  p: 4,
  borderRadius: 2,
  boxSizing: "border-box",
  alignSelf: "center",
} as const;

function resolveMessage(intl: ReturnType<typeof useIntl>, message: string | undefined, fallback: string) {
  if (message?.startsWith("message.") || message?.startsWith("verify.")) {
    return intl.formatMessage({ id: message, defaultMessage: fallback });
  }

  return message || fallback;
}

export default function Verify({
  embedded = false,
  initialCodeSent = false,
  initialCodeExpiresInMinutes = 15,
  successRedirectTo = "/app-settings",
}: VerifyProps = {}) {
  const { token } = useParams();
  const { user } = useSelector((state: RootState) => state.user);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const intl = useIntl();
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(() => token ? "loading" : "idle");
  const [code, setCode] = useState("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>(() => initialCodeSent
    ? intl.formatMessage(
        {
          id: "verify.codeSent",
          defaultMessage: "Verification code sent. It expires in {minutes} minutes.",
        },
        { minutes: initialCodeExpiresInMinutes },
      )
    : "");
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);

  const applyVerifiedUser = (updatedUser?: Partial<User>) => {
    dispatch(login({
      ...user,
      ...updatedUser,
      emailVerified: true,
      token: user.token,
    }));
  };

  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        return;
      }

      if (!user.token) {
        setStatus("error");
        setErrorMessage(intl.formatMessage({
          id: "verify.loginRequired",
          defaultMessage: "Please log in before verifying your email.",
        }));
        return;
      }

      try {
        const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/auth/verify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${user.token}`
          },
          body: JSON.stringify({ token }),
        });

        const data = await response.json().catch(() => null) as VerifyResponse | null;

        if (response.ok && data?.success) {
          applyVerifiedUser(data.user);
          setStatus("success");
          setTimeout(() => {
            navigate(successRedirectTo);
          }, 1200);
        } else {
          setStatus("error");
          setErrorMessage(resolveMessage(intl, data?.message, "Verification failed"));
        }
      } catch (error) {
        setStatus("error");
        setErrorMessage(intl.formatMessage({
          id: "verify.errorDescription",
          defaultMessage: "An error occurred during verification.",
        }));
        console.error("Verification error:", error);
      }
    };

    void verifyToken();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, navigate, successRedirectTo, user.token]);

  const sendCode = async () => {
    if (!user.token) {
      navigate("/login", { state: "/verify" });
      return;
    }

    setSendingCode(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/auth/verify`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${user.token}`,
        },
      });

      const data = await response.json().catch(() => null) as SendCodeResponse | null;

      if (!response.ok || !data?.success) {
        throw new Error(resolveMessage(intl, data?.message, "Failed to send verification code"));
      }

      setSuccessMessage(intl.formatMessage(
        {
          id: "verify.codeSent",
          defaultMessage: "Verification code sent. It expires in {minutes} minutes.",
        },
        { minutes: data.expiresInMinutes || 15 },
      ));
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error && error.message
        ? error.message
        : intl.formatMessage({
            id: "verify.codeSendFailed",
            defaultMessage: "Failed to send verification code.",
          }));
    } finally {
      setSendingCode(false);
    }
  };

  const verifyCode = async (event: FormEvent) => {
    event.preventDefault();

    if (!user.token) {
      navigate("/login", { state: "/verify" });
      return;
    }

    setVerifyingCode(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/auth/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${user.token}`,
        },
        body: JSON.stringify({ code }),
      });

      const data = await response.json().catch(() => null) as VerifyResponse | null;

      if (!response.ok || !data?.success) {
        throw new Error(resolveMessage(intl, data?.message, "Verification failed"));
      }

      applyVerifiedUser(data.user);
      setStatus("success");
      setTimeout(() => {
        navigate(successRedirectTo);
      }, 1200);
    } catch (error) {
      console.error(error);
      setStatus("idle");
      setErrorMessage(error instanceof Error && error.message
        ? error.message
        : intl.formatMessage({
            id: "verify.errorDescription",
            defaultMessage: "An error occurred during verification.",
          }));
    } finally {
      setVerifyingCode(false);
    }
  };

  if (status === "loading") {
    const content = (
      <div className={`flex flex-col items-center justify-center p-4 ${embedded ? '' : 'h-[calc(100vh-65px)]'}`}>
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
          <h2 className="text-xl font-medium">
            <FormattedMessage id="verify.processing" defaultMessage="Verifying your account..." />
          </h2>
        </div>
      </div>
    );

    return content;
  }

  if (status === "success") {
    const content = (
      <div className={`flex flex-col items-center justify-center p-4 ${embedded ? '' : 'h-[calc(100vh-65px)]'}`}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-medium">
            <FormattedMessage id="verify.success" defaultMessage="Verification successful!" />
          </h2>
          <p className="text-gray-500">
            <FormattedMessage id="verify.redirecting" defaultMessage="Redirecting to settings..." />
          </p>
        </div>
      </div>
    );

    return content;
  }

  if (status === "error" && token) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-65px)] p-4">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
            <X className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-medium">
            <FormattedMessage id="verify.error" defaultMessage="Verification failed" />
          </h2>
          <p className="text-red-500">{errorMessage}</p>
          <Button variant="contained" onClick={() => navigate("/verify")}>
            <FormattedMessage id="verify.useCodeInstead" defaultMessage="Use verification code" />
          </Button>
        </div>
      </div>
    );
  }

  const formContent = (
    <Box
      component="form"
      onSubmit={verifyCode}
      sx={{
        display: "grid",
        gap: 2,
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        alignSelf: "stretch",
      }}
    >
      <Box>
        <Typography variant="h5" component="h1" align="center">
          <FormattedMessage id="verify.title" defaultMessage="Verify Email" />
        </Typography>
        <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 1 }}>
          <FormattedMessage
            id="verify.description"
            defaultMessage="Enter the 6-digit code sent to your email."
          />
        </Typography>
      </Box>

      {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
      {successMessage && <Alert severity="success">{successMessage}</Alert>}

      <TextField
        required
        fullWidth
        label={<FormattedMessage id="verify.codeLabel" defaultMessage="6-digit code" />}
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
        inputProps={{
          inputMode: "numeric",
          pattern: "\\d{6}",
          maxLength: 6,
        }}
      />

      <Button
        type="submit"
        fullWidth
        variant="contained"
        disabled={verifyingCode || code.length !== 6}
      >
        {verifyingCode ? <CircularProgress size={22} color="inherit" /> : (
          <FormattedMessage id="verify.submit" defaultMessage="Verify" />
        )}
      </Button>

      <Button
        type="button"
        fullWidth
        variant="outlined"
        disabled={sendingCode}
        onClick={sendCode}
      >
        {sendingCode ? <CircularProgress size={22} color="inherit" /> : (
          <FormattedMessage id="verify.sendCode" defaultMessage="Send verification code" />
        )}
      </Button>
    </Box>
  );

  if (embedded) {
    return formContent;
  }

  return (
    <Container maxWidth="sm">
    <Box
      sx={{
        marginTop: 14,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        marginBottom: 6,
      }}
    >
      <Paper
        elevation={3}
        sx={AUTH_FORM_PAPER_SX}
      >
        {formContent}
      </Paper>
    </Box>
    </Container>
  );
}
