// Genera timestamps en hora de Argentina (America/Argentina/Buenos_Aires, UTC-3, sin DST)
// Usar este helper en TODOS los servicios para garantizar hora correcta
// independientemente de la zona horaria del servidor o de Turso.

function getArgentinaTime() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = {};
  fmt.formatToParts(now).forEach(({ type, value }) => {
    parts[type] = value;
  });

  return {
    // "YYYY-MM-DD HH:MM:SS" — para campos createdAt / openedAt / closedAt
    datetime: `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`,
    // "DD/MM/YYYY" — para el campo date de transacciones
    date: `${parts.day}/${parts.month}/${parts.year}`,
    // "HH:MM" — para el campo time de transacciones
    time: `${parts.hour}:${parts.minute}`,
  };
}

export { getArgentinaTime };
