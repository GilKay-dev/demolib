export const validate = (schema) => (req, res, next) => {
  const { value, error } = schema.validate(req.body ?? {}, { abortEarly: false });
  if (error) {
    const errors = {};
    for (const d of error.details) errors[d.path[0]] ??= d.message;
    return res.status(400).json({ message: "Dữ liệu không hợp lệ", errors });
  }
  req.body = value;
  next();
};
