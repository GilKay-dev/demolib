/* oxlint-disable unicorn/no-thenable -- `then` là khóa bắt buộc của Joi.when */
import Joi from "joi";

const fineLevelId = (message) =>
  Joi.number().integer().min(1).max(2147483647).messages({
    "number.base": message,
    "number.integer": message,
    "number.min": message,
    "number.max": message,
  });

// 2.4.2: Hư hỏng / Mất bắt buộc mức phạt + ghi chú (≤ 500); Bình thường không nhận hai trường này.
// lateFineLevelId bắt buộc hay không phụ thuộc ngày trả nên server kiểm tra trong transaction.
export const confirmReturnSchema = Joi.object({
  condition: Joi.string().valid("NORMAL", "DAMAGED", "LOST").required().messages({
    "any.only": "Tình trạng sách không hợp lệ",
    "string.base": "Tình trạng sách không hợp lệ",
    "any.required": "Bắt buộc chọn tình trạng sách",
  }),
  conditionFineLevelId: Joi.when("condition", {
    is: "NORMAL",
    then: Joi.forbidden(),
    otherwise: fineLevelId("Mức phạt không hợp lệ").required().messages({ "any.required": "Bắt buộc chọn mức phạt" }),
  }),
  note: Joi.when("condition", {
    is: "NORMAL",
    then: Joi.forbidden(),
    otherwise: Joi.string().trim().min(1).max(500).required().messages({
      "string.base": "Ghi chú không hợp lệ",
      "string.empty": "Bắt buộc nhập ghi chú",
      "string.max": "Ghi chú tối đa 500 ký tự",
      "any.required": "Bắt buộc nhập ghi chú",
    }),
  }),
  lateFineLevelId: fineLevelId("Mức phạt trả muộn không hợp lệ"),
});
