export const reportError = (error: { errorType: string, errorMessage: string }) => {
  fetch("https://bi.citizenshub.app/api/bi/error", {
    method: "POST",
    body: JSON.stringify(error),
  });
};
