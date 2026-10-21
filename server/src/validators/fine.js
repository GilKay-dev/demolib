import Joi from "joi";

export const rejectFineSchema = Joi.object({
  reason: Joi.string().trim().min(1).max(255).required().messages({
    "string.base": "Lý do từ chối không hợp lệ",
    "string.empty": "Lý do từ chối là bắt buộc",
    "string.max": "Lý do tối đa 255 ký tự",
    "any.required": "Lý do từ chối là bắt buộc",
  }),
});
