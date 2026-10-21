import Joi from "joi";

export const categorySchema = Joi.object({
  name: Joi.string().trim().min(1).max(50).required().messages({
    "string.empty": "Tên thể loại không được để trống",
    "string.max": "Tên thể loại tối đa 50 ký tự",
    "any.required": "Tên thể loại không được để trống",
  }),
});
