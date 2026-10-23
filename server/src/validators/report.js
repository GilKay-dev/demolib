import Joi from "joi";

const isoDate = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .custom((value, helpers) => {
    const d = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? helpers.error("date.invalid") : value;
  })
  .messages({ "string.pattern.base": "Ngày không hợp lệ", "date.invalid": "Ngày không hợp lệ" });

// Khoảng thời gian: chọn kỳ hiện tại (period) hoặc tự chọn from/to (from/to ưu tiên hơn period)
export const reportQuerySchema = Joi.object({
  period: Joi.string().valid("day", "week", "month", "quarter", "year").default("month"),
  from: isoDate,
  to: isoDate,
  groupBy: Joi.string().valid("day", "week", "month", "quarter").default("day"),
  format: Joi.string().valid("json", "csv").default("json"),
})
  .and("from", "to")
  .custom((value, helpers) => (value.from && value.from > value.to ? helpers.error("range.invalid") : value))
  .messages({
    "range.invalid": "Ngày bắt đầu phải trước ngày kết thúc",
    "object.and": "Cần nhập cả ngày bắt đầu và ngày kết thúc",
  });
