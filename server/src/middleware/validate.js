// Thông báo mặc định (tiếng Việt) cho các lỗi không có message riêng trong schema
const messages = {
  "object.unknown": "Trường không hợp lệ",
  "string.base": "Giá trị không hợp lệ",
  "any.required": "Trường này là bắt buộc",
};

export const validate = (schema) => (req, res, next) => {
  const { value, error } = schema.validate(req.body ?? {}, { abortEarly: false, messages });
  if (error) {
    const errors = {};
    for (const d of error.details) errors[d.path[0]] ??= d.message;
    return res.status(400).json({ message: "Dữ liệu không hợp lệ", errors });
  }
  req.body = value;
  next();
};
