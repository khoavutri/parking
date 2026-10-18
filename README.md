# ParkOne — Hệ thống quản lý bãi xe thông minh

Ứng dụng quản lý bãi xe theo phong cách thực tế: làn vào/ra, sơ đồ chỗ đỗ theo khu, phiên gửi xe, vé lượt & vé tháng, thu ngân ca trực, sự cố và báo cáo lưu lượng — doanh thu. Xây dựng theo tài liệu thiết kế `docs/PRD.md`: React + Vite + TypeScript, Ant Design, SCSS Modules và Dexie (lưu trữ cục bộ trên trình duyệt).

- **Website:** khoadev.vn
- **Email liên hệ:** khoadev.company@gmail.com

## Chạy dự án

```bash
npm install
npm run dev       # chạy môi trường phát triển
npm run build     # kiểm tra TypeScript và build sản phẩm (thư mục dist)
npm run lint      # kiểm tra ESLint
npm run preview   # xem bản build
```

Lần đầu mở ứng dụng, hệ thống tự khởi tạo bộ dữ liệu ban đầu (khu đỗ, chỗ đỗ, khách hàng, xe đang gửi, vé tháng, giao dịch 14 ngày, ca trực và sự cố) để trải nghiệm ngay. Dữ liệu lưu cục bộ trên trình duyệt nên tải lại trang vẫn giữ nguyên; có thể xuất/nhập bản sao lưu JSON hoặc khôi phục dữ liệu khởi tạo trong trang **Thiết lập** (vai trò quản lý).

## Phạm vi đã triển khai

| Nhóm | Nội dung |
|---|---|
| Tổng quan | Xe đang trong bãi, chỗ trống, lượt vào/ra hôm nay, doanh thu hôm nay; doanh thu 7 ngày, vé tháng hiệu lực, sắp hết hạn; biểu đồ lưu lượng theo giờ, doanh thu 7 ngày, cơ cấu doanh thu 30 ngày; cảnh báo xe quá 24h, vé sắp hết hạn, sự cố chưa xử lý |
| Làn vào / làn ra | Nhập biển số với gợi ý loại xe, **quét biển số (AI) mô phỏng** kèm độ tin cậy và khớp khách hàng; nhận diện khách vé tháng tự động; cảnh báo xe đang trong bãi; chọn chỗ trống theo khu hoặc chọn tự động; in phiếu gửi xe; làn ra tính phí theo bậc (miễn phí n phút đầu, bậc 1, giờ tiếp, tối đa/ngày), xử lý mất vé kèm phụ phí, thu tiền và in hoá đơn |
| Phiên gửi xe | Danh sách đang gửi với phí tạm tính trực tiếp, lọc theo loại xe/khu/quá 24h; lịch sử theo khoảng ngày, xuất CSV |
| Sơ đồ bãi | Sơ đồ chỗ đỗ theo khu (ô tô, xe máy), trạng thái trống/đang đỗ/quá 24h/bảo trì; chi tiết xe trong ô, cho xe ra, chuyển chỗ, ghi chú, bật/tắt bảo trì |
| Khách & vé | Khách hàng kèm xe đăng ký, lịch sử vé tháng và phiên gửi xe; bán vé tháng theo gói 1/3/6/12 tháng, gia hạn cộng tiếp thời gian, huỷ vé có lý do; cảnh báo sắp hết hạn |
| Thu ngân & ca trực | Giao dịch theo ngày với tổng theo phương thức thanh toán; mở ca (tiền đầu ca), đóng ca (tiền thực đếm, lệch quỹ); đối soát theo ngày |
| Bảng giá | Cấu hình giá theo loại xe (miễn phí, bậc 1, giờ tiếp, tối đa/ngày, phụ phí mất vé), giá vé tháng theo gói; máy tính thử phí theo giờ vào–ra |
| Báo cáo | Doanh thu theo ngày/loại/phương thức; lưu lượng theo giờ, theo ngày trong tuần, giờ cao điểm; khách & vé tháng (top khách, tỷ lệ lấp đầy theo khu); xuất CSV |
| Thiết lập | Thông tin bãi xe, cấu hình nhận diện biển số (mô phỏng), mẫu in, sao lưu/khôi phục JSON, khôi phục dữ liệu mẫu |

## Kiến trúc

```text
src/
  app/           # router, providers, theme, ngữ cảnh vai trò
  layouts/       # khung giao diện chính (sidebar, topbar, tìm kiếm toàn cục)
  modules/       # trang theo nghiệp vụ (dashboard, gate, sessions, map, ...)
  components/    # thành phần dùng chung (phiếu in, biểu đồ mini, ...)
  db/            # kết nối dữ liệu, lược đồ, dữ liệu khởi tạo
  repositories/  # truy vấn tổng hợp phục vụ dashboard/báo cáo
  services/      # nghiệp vụ: tính phí, vào/ra xe, vé tháng, ca trực, sự cố, sao lưu
  types/         # kiểu dữ liệu dùng chung
  utils/         # định dạng tiền/ngày, chuẩn hoá tìm kiếm, xuất CSV
  styles/        # style toàn cục và mẫu in A4/A5
```

Luồng: **Trang/Form → Service nghiệp vụ → Repository → Dexie (IndexedDB)**. Các thao tác nhiều bảng chạy trong một transaction, chống ghi trùng theo `operationId`, kiểm tra lại trạng thái chỗ đỗ/phiên gửi tại thời điểm ghi.

## Quy trình nghiệp vụ chính

```text
Xe vào (quét biển → nhận diện vé tháng → chọn chỗ → in phiếu gửi xe)
→ Đang gửi (sơ đồ bãi, chuyển chỗ, ghi chú, sự cố, cảnh báo quá 24h)
→ Xe ra (tính phí theo bảng giá → thu tiền / vé tháng miễn phí → in hoá đơn)
→ Ca trực (mở ca, đóng ca đối soát quỹ) → Báo cáo doanh thu – lưu lượng – vé tháng
```

Các vai trò sử dụng (quản lý bãi, nhân viên bãi, thu ngân) chuyển đổi ở góc phải trên; quyền được kiểm tra tại tầng service, không chỉ ẩn nút giao diện.

## Ghi chú vận hành

- Dữ liệu thuộc vùng lưu trữ của tên miền/cổng truy cập hiện tại; đổi địa chỉ truy cập có thể tạo vùng dữ liệu khác.
- Nên xuất bản sao lưu trước khi khôi phục dữ liệu khởi tạo.
- Nút **Quét biển số (AI)** ở làn vào là mô phỏng luồng nhận diện biển số (khung camera + kết quả kèm độ tin cậy) để trình diễn trải nghiệm, không gọi camera thật.
