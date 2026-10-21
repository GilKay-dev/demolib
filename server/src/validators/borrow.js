import Joi from "joi";

export const MAX_BORROW_DAYS = 30;
export const DEFAULT_BORROW_DAYS = 14;

export const createBorrowSchema = Joi.object({
  bookId: Joi.number().integer().min(1).max(2147483647).required().messages({
    "number.base": "Sách không hợp lệ",
    "number.integer": "Sách không hợp lệ",
    "number.min": "Sách không hợp lệ",
    "number.max": "Sách không hợp lệ",
    "any.required": "Vui lòng chọn sách",
  }),
  days: Joi.number().integer().min(1).max(MAX_BORROW_DAYS).default(DEFAULT_BORROW_DAYS).messages({
    "number.base": "Thời hạn từ 1 đến 30 ngày",
    "number.integer": "Thời hạn từ 1 đến 30 ngày",
    "number.min": "Thời hạn từ 1 đến 30 ngày",
    "number.max": "Thời hạn từ 1 đến 30 ngày",
  }),
});
