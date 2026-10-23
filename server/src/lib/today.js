// Múi giờ nghiệp vụ của thư viện. Server (Vercel) chạy giờ UTC nên không dùng getDate() cục bộ,
// nếu không buổi sáng sớm ở Việt Nam sẽ bị tính là "hôm qua" và lệch ngày trễ hạn so với trình duyệt.
const TIME_ZONE = process.env.APP_TIME_ZONE || "Asia/Ho_Chi_Minh";

const dateParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Ngày hôm nay (theo múi giờ thư viện) dạng date 00:00 UTC để lưu vào cột date mà không lệch
export const today = (now = new Date()) => {
  const { year, month, day } = Object.fromEntries(dateParts.formatToParts(now).map((p) => [p.type, p.value]));
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
};
