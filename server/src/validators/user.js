import Joi from "joi";

export const userStatusSchema = Joi.object({
  status: Joi.string().valid("ACTIVE", "DISABLED").required().messages({
    "any.only": "Trạng thái không hợp lệ",
    "any.required": "Trạng thái là bắt buộc",
    "string.base": "Trạng thái không hợp lệ",
  }),
});
