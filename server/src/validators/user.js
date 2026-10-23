import Joi from "joi";

export const userRoleSchema = Joi.object({
  role: Joi.string().valid("READER", "LIBRARIAN", "ADMIN").required().messages({
    "any.only": "Vai trò không hợp lệ",
    "any.required": "Vai trò là bắt buộc",
    "string.base": "Vai trò không hợp lệ",
  }),
});

export const userStatusSchema = Joi.object({
  status: Joi.string().valid("ACTIVE", "DISABLED").required().messages({
    "any.only": "Trạng thái không hợp lệ",
    "any.required": "Trạng thái là bắt buộc",
    "string.base": "Trạng thái không hợp lệ",
  }),
});
