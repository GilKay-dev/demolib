import Joi from "joi";
import { isValidIsbn, normalizeIsbn } from "../lib/isbn.js";

const ISBN_INVALID = "ISBN không hợp lệ (ISBN-10 hoặc ISBN-13)";
export const MAX_QUANTITY = 100000;

// ISBN tùy chọn: rỗng/null -> null; có giá trị thì chuẩn hóa và kiểm tra checksum
const isbn = Joi.string()
  .empty(["", null]) // rỗng/null coi như không nhập
  .default(null)
  .custom((value, helpers) => {
    if (value.trim() === "") return null;
    const normalized = normalizeIsbn(value);
    return isValidIsbn(normalized) ? normalized : helpers.message(ISBN_INVALID);
  })
  .messages({ "string.base": ISBN_INVALID });

// Năm hợp lệ tính tại thời điểm validate (1900 - năm hiện tại)
export const createBookSchema = () =>
  Joi.object({
    title: Joi.string().trim().min(1).max(100).required().messages({
      "string.empty": "Tên sách không được để trống",
      "string.max": "Tên sách tối đa 100 ký tự",
      "any.required": "Tên sách không được để trống",
    }),
    author: Joi.string().trim().min(1).max(100).required().messages({
      "string.empty": "Tác giả không được để trống",
      "string.max": "Tác giả tối đa 100 ký tự",
      "any.required": "Tác giả không được để trống",
    }),
    publishYear: Joi.number().integer().min(1900).max(new Date().getFullYear()).required().messages({
      "number.base": "Năm xuất bản không hợp lệ",
      "number.integer": "Năm xuất bản không hợp lệ",
      "number.min": `Năm xuất bản phải từ 1900 đến ${new Date().getFullYear()}`,
      "number.max": `Năm xuất bản phải từ 1900 đến ${new Date().getFullYear()}`,
      "any.required": "Năm xuất bản không được để trống",
    }),
    isbn,
    categoryId: Joi.number().integer().positive().required().messages({
      "number.base": "Vui lòng chọn thể loại",
      "number.integer": "Vui lòng chọn thể loại",
      "number.positive": "Vui lòng chọn thể loại",
      "any.required": "Vui lòng chọn thể loại",
    }),
    description: Joi.string().trim().min(1).max(255).required().messages({
      "string.empty": "Mô tả không được để trống",
      "string.max": "Mô tả tối đa 255 ký tự",
      "any.required": "Mô tả không được để trống",
    }),
    quantity: Joi.number().integer().min(1).max(MAX_QUANTITY).required().messages({
      "number.base": "Số lượng phải là số",
      "number.integer": "Số lượng phải là số nguyên",
      "number.min": "Số lượng phải lớn hơn 0",
      "number.max": `Số lượng tối đa ${MAX_QUANTITY}`,
      "any.required": "Số lượng không được để trống",
    }),
  });
