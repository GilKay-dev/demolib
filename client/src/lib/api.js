import axios from 'axios'

export const api = axios.create({ baseURL: '/api' })

let token = null
let onUnauthorized = () => {}

export const setToken = (t) => {
  token = t
}
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn
}

api.interceptors.request.use((config) => {
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Token hết hạn / bị thu hồi khi đang đăng nhập: đăng xuất. 401 lúc chưa có token (sai mật khẩu) thì bỏ qua.
api.interceptors.response.use(undefined, (err) => {
  if (err.response?.status === 401 && token) onUnauthorized()
  return Promise.reject(err)
})
