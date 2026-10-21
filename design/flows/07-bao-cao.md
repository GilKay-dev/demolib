# 07 — Báo Cáo & Thống Kê (2.7)

## 2.7.1 Báo Cáo Tổng Quan (Dashboard)

**Actor:** Admin, Librarian · **API:** `GET /api/reports/overview`

```mermaid
flowchart TD
    S(["Admin / NV mở Dashboard"]) --> AUTH{"Role là Admin hoặc Librarian?"}
    AUTH -->|"Không"| E403(["403 Không có quyền"])
    AUTH -->|"Có"| Q["Chạy song song các truy vấn tổng hợp"]
    Q --> K1["Sách: Có sẵn = tổng available; Đang mượn = tổng borrowed; Bị mất / Hư hỏng = số lần trả có tình trạng tương ứng"]
    Q --> K2["Độc giả (role Reader): Hoạt động = Kích hoạt; Vô hiệu hóa"]
    Q --> K3["Đơn mượn hôm nay = số đơn tạo trong ngày (giờ VN)"]
    Q --> K4["Top 5 sách = nhiều đơn đã xác nhận nhất"]
    Q --> K5["Độc giả nợ quá hạn = đơn Quá hạn, nhóm theo độc giả: số sách, số ngày trễ lớn nhất"]
    K1 --> R
    K2 --> R
    K3 --> R
    K4 --> R
    K5 --> R
    R{"Có dữ liệu?"}
    R -->|"Không"| Z(["Hiển thị 0 và trạng thái trống cho từng khối"])
    R -->|"Có"| OK(["Thẻ số liệu + biểu đồ Recharts + bảng độc giả quá hạn"])
    OK --> CLK["Click một độc giả quá hạn"] --> DET(["Mở danh sách đơn của độc giả đó (chỉ xem)"])
```

**Edge case:** Một truy vấn lỗi thì khối đó hiện "Không tải được dữ liệu, thử lại"; các khối còn lại vẫn hiển thị.

---

## 2.7.2 Báo Cáo Chi Tiết

**Actor:** Admin, Librarian · **API:** `GET /api/reports/:type?period=&from=&to=` và `GET /api/reports/:type/export?...` (CSV)

```mermaid
flowchart TD
    S(["Mở trang Báo cáo chi tiết"]) --> T["Chọn loại báo cáo: Sách / Mượn trả / Phạt / Sách mất - hư"]
    T --> P["Chọn khoảng thời gian: Ngày / Tuần / Tháng / Quý / Năm, kèm từ ngày - đến ngày (mặc định tháng hiện tại)"]
    P --> V{"Tham số hợp lệ?"}
    V -->|"Loại báo cáo không tồn tại"| E1["400 Loại báo cáo không hợp lệ"]
    V -->|"Từ ngày sau đến ngày, hoặc ngày sai định dạng"| E2["Lỗi: Khoảng thời gian không hợp lệ"] --> P
    V -->|"Hợp lệ"| Q{"Loại báo cáo"}
    Q -->|"Sách"| B["Mỗi sách: total, available, borrowed, số lần mất / hư, số lần mượn trong kỳ"]
    Q -->|"Mượn trả"| BR["Số lượt mượn (đã xác nhận) và lượt trả, nhóm theo ngày / tuần / tháng / quý / năm"]
    Q -->|"Phạt"| F["Doanh thu = tổng phiếu Đã thanh toán có paid_at trong kỳ; danh sách người còn nợ: tổng phiếu chưa Đã thanh toán"]
    Q -->|"Sách mất - hư"| L["Danh sách lượt trả Mất / Hư hỏng trong kỳ: Sách, Độc giả, Ngày, Ghi chú → sách cần thay thế"]
    B --> RES
    BR --> RES
    F --> RES
    L --> RES
    RES{"Có dữ liệu?"}
    RES -->|"Không"| EMPTY(["Không có dữ liệu trong khoảng thời gian đã chọn"])
    RES -->|"Có"| SHOW(["Hiển thị bảng + biểu đồ"])
    SHOW --> EX["Click 'Xuất CSV'"]
    EMPTY --> EX
    EX --> CSV["Server sinh CSV với cùng bộ lọc: UTF-8 có BOM để Excel đọc đúng tiếng Việt"]
    CSV --> DL(["Tải file baocao_loai_tu-den.csv (không có dữ liệu thì chỉ có dòng tiêu đề)"])
```

**Edge case:**
- Khoảng thời gian quá dài với nhóm theo Ngày (vd. hơn 366 ngày) → yêu cầu chọn nhóm lớn hơn hoặc tự chuyển sang Tháng.
- Mọi mốc thời gian tính theo múi giờ `Asia/Ho_Chi_Minh` để "hôm nay" và "tháng này" khớp với thư viện.
