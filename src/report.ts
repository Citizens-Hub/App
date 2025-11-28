export const reportError = (error: { errorType: string, errorMessage: string, callStack?: string }) => {
  fetch(`${import.meta.env.VITE_PUBLIC_BI_ENDPOINT}/api/bi/error`, {
    method: "POST",
    body: JSON.stringify(error),
  });
};
