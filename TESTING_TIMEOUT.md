# Testing Timeout Functionality (1 Minute Mode)

## ⚠️ IMPORTANT: TESTING MODE ACTIVE

Timeout telah diubah menjadi **1 menit** untuk kedua jenis timeout untuk memudahkan testing:

- **Payment Timeout**: 1 menit (dari 60 menit)
- **Confirmation Timeout**: 1 menit (dari 3 jam)

## 🧪 Cara Testing

### 1. Payment Timeout Test

**Langkah-langkah:**
1. Buat order baru melalui aplikasi
2. **JANGAN bayar** order tersebut (biarkan status "payment")
3. Tunggu **1 menit**
4. Cek database atau refresh halaman
5. Status order harus berubah menjadi "cancelled"
6. Notifikasi harus dikirim ke client

**Expected Result:**
```javascript
{
  status: 'cancelled',
  paymentStatus: 'expired',
  cancellationReason: 'Payment timeout (1 minute - TESTING)',
  cancelledAt: [timestamp],
  'timeline.cancelled': [timestamp]
}
```

### 2. Confirmation Timeout Test

**Langkah-langkah:**
1. Buat order baru dan **bayar** order tersebut
2. Status akan berubah menjadi "pending" (menunggu konfirmasi freelancer)
3. **JANGAN accept/reject** sebagai freelancer
4. Tunggu **1 menit**
5. Cek database atau refresh halaman
6. Status order harus berubah menjadi "cancelled"
7. Refund otomatis harus diproses

**Expected Result:**
```javascript
{
  status: 'cancelled',
  cancellationReason: 'Freelancer confirmation timeout (1 minute - TESTING)',
  refundStatus: 'pending',
  cancelledAt: [timestamp],
  'timeline.cancelled': [timestamp]
}
```

## 🔄 Manual Testing

Jalankan script testing:

```bash
cd skillnusa-api
node src/scripts/test-timeout-1min.js
```

Atau test timeout checker secara manual:

```bash
curl -X POST https://your-app.vercel.app/api/cron/timeout-checker \
  -H "X-Cron-Secret: your-secret" \
  -H "Content-Type: application/json"
```

## ⏰ Monitoring

### Cron Job
- **Frequency**: Setiap 5 menit
- **Endpoint**: `/api/cron/timeout-checker`
- **Authentication**: X-Cron-Secret header

### Logs to Watch
```
🕐 [TimeoutChecker] Starting timeout check
🔍 [TimeoutChecker] Found X payment timeouts
⏰ [TimeoutChecker] Processing timeout for order: ID
✅ [TimeoutChecker] Status changed to CANCELLED
```

## 📊 Database Changes

### Payment Timeout
- `status`: 'payment' → 'cancelled'
- `paymentStatus`: 'pending' → 'expired'
- `cancellationReason`: 'Payment timeout (1 minute - TESTING)'
- `cancelledAt`: current timestamp
- `timeline.cancelled`: current timestamp

### Confirmation Timeout
- `status`: 'pending' → 'cancelled'
- `cancellationReason`: 'Freelancer confirmation timeout (1 minute - TESTING)'
- `refundStatus`: 'pending'
- `refundAmount`: order total amount
- `cancelledAt`: current timestamp
- `timeline.cancelled`: current timestamp

## 🔔 Notifications

### Payment Timeout
- **Target**: Client
- **Message**: "Waktu pembayaran untuk [order] telah habis (1 menit - TESTING). Pesanan dibatalkan."

### Confirmation Timeout
- **Target**: Client & Freelancer
- **Client**: "Pesanan [order] dibatalkan karena freelancer tidak merespons dalam 1 menit (TESTING). Refund akan diproses."
- **Freelancer**: "Pesanan [order] dibatalkan karena tidak dikonfirmasi dalam 1 menit (TESTING)."

## 🚨 AFTER TESTING

**WAJIB mengembalikan ke production values:**

### 1. orderService.js
```javascript
// Change back to:
paymentExpiredAt: new Date(Date.now() + 60 * 60 * 1000), // 60 minutes
```

### 2. tripay/callback/route.js
```javascript
// Change back to:
confirmationDeadline.setHours(confirmationDeadline.getHours() + 3); // 3 hours
```

### 3. paymentService.js
```javascript
// Change back to:
const expiredTime = Math.floor(Date.now() / 1000) + (60 * 60); // 60 minutes
```

### 4. timeout-checker/route.js
```javascript
// Change back to:
cancellationReason: 'Payment timeout (60 minutes)'
cancellationReason: 'Freelancer confirmation timeout (3 hours)'
```

### 5. Update all notification messages
Remove "(TESTING)" and "(1 minute)" from all messages.

## 🔧 Quick Revert Script

Buat script untuk mengembalikan ke production:

```bash
# Find and replace all testing timeouts
grep -r "1 minute" src/ --include="*.js"
grep -r "TESTING" src/ --include="*.js"
```

## ⚡ Testing Checklist

- [ ] Payment timeout works (1 minute)
- [ ] Confirmation timeout works (1 minute)
- [ ] Status changes to "cancelled"
- [ ] Notifications sent correctly
- [ ] Refund processed for confirmation timeout
- [ ] Cron job runs every 5 minutes
- [ ] Manual timeout checker works
- [ ] Database updates correctly
- [ ] Timeline fields updated
- [ ] Error handling works
- [ ] **REVERT to production timeouts after testing** 