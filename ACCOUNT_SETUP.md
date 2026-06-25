# Account va VIP

Web dung Supabase Auth de dang nhap bang email magic link.
Frontend hien ho tro 3 cach:

- Dang nhap bang email + mat khau.
- Tao account bang email + mat khau.
- Gui magic link qua email.

## Da cau hinh

- Site URL: `https://vominhthanh996-lang.github.io/truyen-2k/`
- Redirect URL: `https://vominhthanh996-lang.github.io/truyen-2k/`
- Frontend dung `doc-truyen-vip/supabase-config.js`.

## Bang database

File `supabase-comments-schema.sql` tao cac bang:

- `comments`: binh luan, co `user_id` va `user_email` neu doc gia da dang nhap.
- `profiles`: ho so user co email va ten hien thi.
- `vip_entitlements`: ghi nhan user nao dang co VIP.
- `stories`: metadata truyen hien public duoc, khong co noi dung chuong.
- `story_chapters`: metadata chuong, trang thai free/tinh phi, gia xu, audio URL.
- `story_chapter_bodies`: noi dung chuong. Bang nay khong co policy public select, browser khong doc truc tiep duoc.
- `account_wallets`: so du VND/xu cua user, frontend chi doc.
- `coin_packages`: cac goi nap xu dang ban.
- `payment_orders`: moi lan user bam nap xu se tao mot don rieng co `order_code` duy nhat gan voi `user_id`.
- `reading_progress`: user dang doc toi truyen/chuong nao.
- `unlocked_chapters`: nhung chuong user da mo khoa rieng.
- `coin_transactions`: lich su nap/tru xu cua tung user.

## Doc truyen tu database

Frontend chi goi 2 function:

```sql
public.get_story_catalog()
public.get_chapter_for_reader(p_story_id, p_chapter_id)
```

`get_story_catalog()` chi tra metadata va danh sach chuong, khong tra body.
`get_chapter_for_reader()` kiem tra chuong free, VIP, hoac da mo khoa trong DB roi moi tra `body`.
Neu chua du quyen, function khong tra noi dung chuong.

File `data.js` khong con duoc publish len GitHub Pages. Workflow deploy xoa file nay khoi artifact de tranh lo full text tren frontend.

## Mo khoa chuong bang xu

Frontend khong tu tru xu. Khi doc gia bam mo khoa chuong, web goi function Supabase:

```sql
public.unlock_chapter_with_coins(p_story_id, p_chapter_id)
```

Function nay lay gia tu bang `story_chapters`, khoa dong vi cua user, kiem tra du xu, tru `account_wallets.coin_balance`, ghi `coin_transactions`, roi ghi `unlocked_chapters`.

Neu chuong da mo roi thi function tra ve thanh cong va khong tru xu lan nua.
Neu user khong du xu thi tra loi `INSUFFICIENT_COINS`.

## Ghi nhan VIP thu cong

Sau nay khi co payment webhook, backend se insert vao `vip_entitlements`. Trong luc chua co payment, co the kich hoat thu cong bang SQL:

```sql
insert into public.vip_entitlements (user_id, plan_id, active_until, source, note)
values (
  'USER_ID_TREN_SUPABASE_AUTH',
  'vip-monthly',
  now() + interval '30 days',
  'manual',
  'Kich hoat thu cong'
);
```

Nguoi dung chi doc duoc entitlement cua chinh ho qua RLS.

## Payment sau nay

Payment dung payOS/VietQR:

1. User dang nhap va bam nap xu.
2. Edge Function `create-payos-payment` tao `payment_orders` voi `order_code` duy nhat, gan voi `user_id` hien tai.
3. Function tao payment link/QR qua payOS.
4. Tien di vao tai khoan ngan hang da lien ket trong dashboard payOS cua mày.
5. payOS goi Edge Function `payos-webhook` khi ngan hang bao thanh cong.
6. Webhook verify chu ky HMAC bang `PAYOS_CHECKSUM_KEY`.
7. Webhook goi RPC `credit_payment_order`.
8. RPC khoa order, check status pending, check so tien, cap nhat `payment_orders.status = paid`, cong `account_wallets.coin_balance`, va ghi `coin_transactions`.

Neu payOS gui webhook lap lai, RPC thay order da `paid` va khong cong xu lan nua.
Neu nhieu account cung mua cung luc, he thong phan biet bang `order_code` duy nhat trong `payment_orders`; moi `order_code` co san `user_id`, `package_id`, `amount_vnd`, `coins`.

Can set Supabase Edge Function secrets:

```bash
PAYOS_CLIENT_ID=...
PAYOS_API_KEY=...
PAYOS_CHECKSUM_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SITE_URL=https://vominhthanh996-lang.github.io/truyen-2k/
```

Sau khi deploy function, vao payOS dashboard cau hinh webhook URL:

```text
https://lgjkyclvpzijvjepmncq.functions.supabase.co/payos-webhook
```

Khong de frontend tu cap nhat VIP/vi tien, vi user co the sua code tren trinh duyet.
