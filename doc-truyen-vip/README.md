# Truyện 2K MVP

Static MVP cho web đọc truyện thu phí ở Việt Nam.

## Cách chạy

Mở `index.html` bằng trình duyệt.

## Tên Miền Production

GitHub Pages hiện dùng URL mặc định của repo. Muốn mất hẳn `github.io` và tên tài khoản GitHub thì cần mua hoặc trỏ một domain riêng, ví dụ `truyen2k.vn`, `truyen2k.com`, hoặc `doc.truyen2k.vn`.

Các bước khi đã có domain:

1. Tạo file `CNAME` trong `doc-truyen-vip/` chứa đúng domain.
2. Trỏ DNS của domain về GitHub Pages.
3. Bật HTTPS trong Settings -> Pages.

## Tính năng có sẵn

- Trang chủ, thư viện, trang chi tiết truyện, reader mode.
- Tất cả chương đang mở miễn phí.
- Reader tiếng Việt rõ dấu trên desktop/mobile, có nền sáng/nền tối.
- Mỗi chương có khu vực nghe audio: chỉ phát khi có MP3 FPT đã verify, để tránh giả 5 giọng bằng Web Speech/Edge.
- Bình luận ở trang truyện và từng chương.
- Nếu đã cấu hình Supabase, bình luận sẽ đồng bộ chung cho mọi độc giả.
- Lưu chương đang đọc và tuỳ chọn reader/audio bằng `localStorage`.
- Trang quản trị nội bộ để xem tổng truyện và chương miễn phí.

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

## Tạo Audio FPT Cho Chương

Hiện Edge/Web Speech chỉ có 2 giọng Việt thật, nên không dùng để giả 5 giọng. Muốn tạo 5 giọng khác nhau cần FPT.AI và biến môi trường `FPT_API_KEY` hoặc `FPT_AI_API_KEY`.

Năm preset đang map vào 5 voice FPT khác nhau:

- `nu-cam-xuc`: Ban Mai - nữ miền Bắc.
- `nam-tram`: Lê Minh - nam miền Bắc.
- `nu-cham-am`: Mỹ An - nữ miền Trung.
- `nam-cang-thang`: Gia Huy - nam miền Trung.
- `nu-nhe-nhang`: Lan Nhi - nữ miền Nam.

Gen 1 chương 1 giọng:

```powershell
python tools/generate_chapter_audio.py --chapter c001 --preset nu-cam-xuc --engine fpt --overwrite
python tools/build_doc_truyen_data.py
```

Tạo toàn bộ chương đủ 5 giọng sẽ rất lâu và tạo nhiều file MP3. Nên test 1 chương trước:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/gen_audio_upload.ps1 -Chapter c001 -Preset all -Engine fpt -Overwrite -Upload -Message "Upload c001 FPT audio"
```

File MP3 chỉ được web gắn vào `data.js` sau khi verify và có `provider: "fpt"` trong `doc-truyen-vip/audio/verified-audio.json`.

## Gen Audio Và Upload Một Lệnh

Luồng an toàn mới là: gen MP3 dưới máy, verify file, rebuild `data.js`, rồi mới upload. Web chỉ dùng MP3 đã có trong `doc-truyen-vip/audio/verified-audio.json`, nên file cũ hoặc file lỗi sẽ không tự bật.

Gen 1 chương, 1 giọng, chưa upload:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/gen_audio_upload.ps1 -Chapter c001 -Preset nu-cam-xuc -Engine fpt -Overwrite
```

Gen 1 chương đủ 5 giọng và upload lên GitHub Pages:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/gen_audio_upload.ps1 -Chapter c001 -Preset all -Engine fpt -Overwrite -Upload -Message "Upload c001 FPT audio"
```

Gen thử 3 chương đầu, 1 giọng:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/gen_audio_upload.ps1 -All -Limit 3 -Preset nu-cam-xuc -Engine fpt -Overwrite -Upload
```

## Nâng Cấp Lên Bản Thật

1. Chuyển data từ `data.js` sang database Supabase/Postgres.
2. Thêm auth thật: email/password hoặc Google.
3. Tạo API server:
   - `POST /api/payments/create` gọi payOS tạo payment link/QR.
   - `POST /api/payments/webhook` xác thực webhook và cấp VIP/xu.
4. Thêm bảng giao dịch có `orderCode`, `userId`, `planId`, `amount`, `status`.
5. Khóa chương ở server, không chỉ khóa ở frontend.
