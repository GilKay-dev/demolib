// Bỏ dấu '-' và khoảng trắng, chữ X viết hoa (cùng quy tắc với server/src/lib/isbn.js)
export const normalizeIsbn = (raw) => String(raw).replace(/[-\s]/g, '').toUpperCase()

function isValidIsbn10(s) {
  if (!/^\d{9}[\dX]$/.test(s)) return false
  const sum = [...s].reduce((acc, ch, i) => acc + (ch === 'X' ? 10 : Number(ch)) * (10 - i), 0)
  return sum % 11 === 0
}

function isValidIsbn13(s) {
  if (!/^\d{13}$/.test(s)) return false
  const sum = [...s].reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0)
  return sum % 10 === 0
}

export const isValidIsbn = (raw) => {
  const s = normalizeIsbn(raw)
  return isValidIsbn10(s) || isValidIsbn13(s)
}
