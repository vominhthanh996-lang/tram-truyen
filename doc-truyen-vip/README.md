# DocTruyen VIP MVP

Static MVP cho web đọc truyện thu phí ở Việt Nam.

## Cách chạy

Mở `index.html` bằng trình duyệt.

## Tính năng có sẵn

- Trang chủ, thư viện, trang chi tiết truyện, reader mode.
- Chương miễn phí và chương khóa.
- VIP 30 ngày hoặc mở chương bằng xu.
- Checkout payOS/VietQR mock: bấm "Mô phỏng đã thanh toán" để kích hoạt gói.
- Bình luận ở trang truyện và từng chương.
- Nếu đã cấu hình Supabase, bình luận sẽ đồng bộ chung cho mọi độc giả.
- Lưu ví xu, VIP, chương đã mở và lịch sử giao dịch bằng `localStorage`.
- Admin demo để xem tổng truyện, chương khóa, giao dịch.

## Bật Bình Luận Chung Bằng Supabase

1. Tạo project trên Supabase.
2. Mở SQL Editor và chạy file `supabase-schema.sql`.
3. Vào Project Settings -> API, lấy `Project URL` và `anon public key`.
4. Điền vào `supabase-config.js`:

```js
window.SUPABASE_CONFIG = {
  url: "https://YOUR_PROJECT.supabase.co",
  anonKey: "YOUR_ANON_PUBLIC_KEY"
};
```

Khi hai giá trị này có thật, web sẽ dùng Supabase REST API để đọc/ghi bình luận chung.

## Nâng Cấp Lên Bản Thật

1. Chuyển data từ `data.js` sang database Supabase/Postgres.
2. Thêm auth thật: email/password hoặc Google.
3. Tạo API server:
   - `POST /api/payments/create` gọi payOS tạo payment link/QR.
   - `POST /api/payments/webhook` xác thực webhook và cấp VIP/xu.
4. Thêm bảng giao dịch có `orderCode`, `userId`, `planId`, `amount`, `status`.
5. Khóa chương ở server, không chỉ khóa ở frontend.
