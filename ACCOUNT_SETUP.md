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
- `account_wallets`: so du VND/xu cua user, frontend chi doc.
- `reading_progress`: user dang doc toi truyen/chuong nao.
- `unlocked_chapters`: nhung chuong user da mo khoa rieng.

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

Khi noi payment that, webhook can lam 3 viec:

1. Xac minh giao dich thanh cong.
2. Tim `user_id` cua account mua goi.
3. Insert/update `vip_entitlements`, `account_wallets`, hoac `unlocked_chapters`.

Khong de frontend tu cap nhat VIP/vi tien, vi user co the sua code tren trinh duyet.
