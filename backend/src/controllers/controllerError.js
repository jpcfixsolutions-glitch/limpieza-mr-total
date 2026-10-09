export function sendControllerError(res, error) {
  const status = Number(error?.status);
  const isExpectedClientError = Number.isInteger(status) && status >= 400 && status < 500;

  if (!isExpectedClientError) {
    console.error("Error no controlado en una solicitud:", error);
  }

  return res.status(isExpectedClientError ? status : 500).json({
    message:
      isExpectedClientError && typeof error?.message === "string"
        ? error.message
        : "Error interno del servidor. Intentá nuevamente.",
  });
}
