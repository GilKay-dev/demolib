import Joi from "joi";

export const loginSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().max(255).required().messages({
    "string.email": "Email không hợp lệ",
    "string.empty": "Email không được để trống",
    "any.required": "Email không được để trống",
  }),
  password: Joi.string().min(8).max(16).required().messages({
    "string.empty": "Mật khẩu không được để trống",
    "string.min": "Mật khẩu phải từ 8 đến 16 ký tự",
    "string.max": "Mật khẩu phải từ 8 đến 16 ký tự",
    "any.required": "Mật khẩu không được để trống",
  }),
});

export const registerSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().max(255).required().messages({
    "string.email": "Email không hợp lệ",
    "string.empty": "Email không được để trống",
    "any.required": "Email không được để trống",
  }),
  name: Joi.string().trim().min(1).max(50).required().messages({
    "string.empty": "Tên không được để trống",
    "string.max": "Tên tối đa 50 ký tự",
    "any.required": "Tên không được để trống",
  }),
  password: Joi.string().min(8).max(16).required().messages({
    "string.empty": "Mật khẩu không được để trống",
    "string.min": "Mật khẩu phải từ 8 đến 16 ký tự",
    "string.max": "Mật khẩu phải từ 8 đến 16 ký tự",
    "any.required": "Mật khẩu không được để trống",
  }),
  confirmPassword: Joi.string().valid(Joi.ref("password")).required().messages({
    "any.only": "Mật khẩu xác nhận không khớp",
    "string.empty": "Mật khẩu xác nhận không được để trống",
    "any.required": "Mật khẩu xác nhận không được để trống",
  }),
});
