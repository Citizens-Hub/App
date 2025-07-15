import { useParams, useNavigate } from "react-router";
import { useEffect, useState } from "react";
import { Loader2, Check, X } from "lucide-react";
import { FormattedMessage } from "react-intl";
import { RootState } from "@/store";
import { useSelector } from "react-redux";

export default function Verify() {
  const { token } = useParams();
  const { user } = useSelector((state: RootState) => state.user);
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    const verifyToken = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/auth/verify`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${user.token}`
          },
          body: JSON.stringify({ token }),
        });

        const data = await response.json();

        if (response.ok && data.success) {
          setStatus("success");
          // 短暂延迟后导航到设置页面
          setTimeout(() => {
            navigate("/app-settings");
          }, 2000);
        } else {
          setStatus("error");
          setErrorMessage(data.message || "Verification failed");
        }
      } catch (error) {
        setStatus("error");
        setErrorMessage("An error occurred during verification");
        console.error("Verification error:", error);
      }
    };

    if (token) {
      verifyToken();
    } else {
      setStatus("error");
      setErrorMessage("No verification token provided");
    }
  }, [token, navigate, user]);

  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-65px)] p-4">
      {status === "loading" && (
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
          <h2 className="text-xl font-medium">
            <FormattedMessage id="verify.processing" defaultMessage="Verifying your account..." />
          </h2>
        </div>
      )}

      {status === "success" && (
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
      )}

      {status === "error" && (
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
            <X className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-medium">
            <FormattedMessage id="verify.error" defaultMessage="Verification failed" />
          </h2>
          <p className="text-red-500">{errorMessage}</p>
          <button
            onClick={() => navigate("/login")}
            className="px-4 py-2 mt-4 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
          >
            <FormattedMessage id="verify.goToLogin" defaultMessage="Go to Login" />
          </button>
        </div>
      )}
    </div>
  );
}