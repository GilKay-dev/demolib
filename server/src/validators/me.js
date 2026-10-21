import Joi from "joi";

export const updateProfileSchema = Joi.object({
  name: Joi.string().trim().min(1).max(50).required().messages({
    "string.empty": "Tên không được để trống",
    "string.max": "Tên tối đa 50 ký tự",
    "any.required": "Tên không được để trống",
  }),
  phone: Joi.string().trim().pattern(/^0[0-9]{9}$/).allow("", null).required().messages({
    "string.pattern.base": "Số điện thoại không hợp lệ (10 chữ số, bắt đầu bằng 0)",
  }),
  address: Joi.string().trim().min(1).max(255).required().messages({
    "string.empty": "Địa chỉ không được để trống",
    "string.max": "Địa chỉ tối đa 255 ký tự",
    "any.required": "Địa chỉ không được để trống",
  }),
});

const newPasswordMessages = {
  "string.empty": "Mật khẩu mới không được để trống",
  "string.min": "Mật khẩu phải từ 8 đến 16 ký tự",
  "string.max": "Mật khẩu phải từ 8 đến 16 ký tự",
  "any.required": "Mật khẩu mới không được để trống",
  "any.invalid": "Mật khẩu mới phải khác mật khẩu cũ",
};

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required().messages({
    "string.empty": "Mật khẩu hiện tại không được để trống",
    "any.required": "Mật khẩu hiện tại không được để trống",
  }),
  newPassword: Joi.string().min(8).max(16).invalid(Joi.ref("currentPassword")).required().messages(newPasswordMessages),
  confirmPassword: Joi.string().valid(Joi.ref("newPassword")).required().messages({
    "any.only": "Mật khẩu xác nhận không khớp",
    "string.empty": "Mật khẩu xác nhận không được để trống",
    "any.required": "Mật khẩu xác nhận không được để trống",
  }),
});
