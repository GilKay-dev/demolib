import Joi from "joi";

// Số tiền lưu numeric(12,0): số nguyên dương, tối đa 12 chữ số
const AMOUNT_MAX = 999999999999;

export const fineLevelSchema = Joi.object({
  name: Joi.string().trim().min(1).max(25).required().messages({
    "string.empty": "Tên mức phạt không được để trống",
    "string.max": "Tên mức phạt tối đa 25 ký tự",
    "any.required": "Tên mức phạt không được để trống",
  }),
  amount: Joi.number().integer().greater(0).max(AMOUNT_MAX).required().messages({
    "number.base": "Số tiền phải là số",
    "number.integer": "Số tiền phải là số nguyên",
    "number.greater": "Số tiền phải lớn hơn 0",
    "number.max": "Số tiền quá lớn",
    "any.required": "Số tiền là bắt buộc",
  }),
  // Ngày dạng YYYY-MM-DD; bỏ trống thì DB lấy ngày hiện tại
  effectiveDate: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .custom((value, helpers) => {
      const d = new Date(`${value}T00:00:00Z`);
      return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? helpers.error("date.invalid") : value;
    })
    .messages({
      "string.pattern.base": "Ngày không hợp lệ",
      "date.invalid": "Ngày không hợp lệ",
      "string.base": "Ngày không hợp lệ",
    }),
});
