export function requireBusinessUnit(...codes) {
  return (req, res, next) => {
    if (!req.businessUnit) return res.status(400).json({ message: "Falta el contexto de unidad de negocio." });
    if (!codes.includes(req.businessUnit.code)) {
      return res.status(403).json({ message: `Esta operación no está disponible en ${req.businessUnit.name}.` });
    }
    next();
  };
}
