// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // eslint-disable-next-line no-console
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || "Something went wrong on the server." });
}

export function notFound(req, res) {
  res.status(404).json({ error: "Not found." });
}
