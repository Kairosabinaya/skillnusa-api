# SkillNusa Timeout System Documentation

## Overview
Sistem timeout otomatis untuk mengelola order yang tidak dibayar atau tidak dikonfirmasi dalam batas waktu yang ditentukan.

## Timeout Types

### 1. Payment Timeout (1 menit - TESTING MODE)
**Kondisi**: Order dengan status `'payment'` yang melewati `paymentExpiredAt`

**Aksi yang dilakukan**:
- Status berubah: `'payment'` → `'cancelled'`
- PaymentStatus berubah: `'pending'` → `'expired'`
- Set `cancellationReason`: "Payment timeout (1 minute - TESTING)"
- Set `cancelledAt` dan `updatedAt`
- Update `timeline.cancelled`
- Kirim notifikasi ke client

**Database Update**:
```javascript
{
  status: 'cancelled',
  paymentStatus: 'expired',
  cancellationReason: 'Payment timeout (1 minute - TESTING)',
  cancelledAt: now,
  updatedAt: now,
  'timeline.cancelled': now
}
```

### 2. Freelancer Confirmation Timeout (1 menit - TESTING MODE)
**Kondisi**: Order dengan status `'pending'` yang melewati `confirmationDeadline`

**Aksi yang dilakukan**:
- Status berubah: `'pending'` → `'cancelled'`
- Set `cancellationReason`: "Freelancer confirmation timeout (1 minute - TESTING)"
- Set `cancelledAt` dan `updatedAt`
- Set `refundStatus`: 'pending'
- Trigger automatic refund jika sudah dibayar
- Update timeline
- Kirim notifikasi ke client dan freelancer

**Database Update**:
```javascript
{
  status: 'cancelled',
  cancellationReason: 'Freelancer confirmation timeout (1 minute - TESTING)',
  cancelledAt: now,
  updatedAt: now,
  refundStatus: 'pending',
  refundAmount: orderData.totalAmount || orderData.price || 0,
  refundInitiatedAt: now,
  'timeline.cancelled': now,
  'timeline.refundInitiatedAt': now
}
```

## Cron Job Configuration

### Vercel Cron Setup
File: `vercel.json`
```json
{
  "crons": [
    {
      "path": "/api/cron/timeout-checker",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

**Schedule**: Setiap 5 menit
**Endpoint**: `/api/cron/timeout-checker`
**Method**: POST
**Authentication**: X-Cron-Secret header

### Environment Variables Required
```
CRON_SECRET=your-secure-random-string
VERCEL_URL=https://your-app.vercel.app
```

## API Endpoint

### POST /api/cron/timeout-checker

**Headers**:
- `X-Cron-Secret`: Required for authentication

**Response**:
```json
{
  "success": true,
  "message": "Timeout check completed",
  "processedCount": 2,
  "results": {
    "paymentTimeouts": 1,
    "confirmationTimeouts": 1,
    "errors": []
  },
  "timestamp": "2025-01-14T10:30:00.000Z"
}
```

## Testing

### Manual Testing
Gunakan script test: `src/scripts/test-timeout-checker.js`

```bash
node src/scripts/test-timeout-checker.js
```

### Health Check
```bash
GET /api/cron/timeout-checker
```

## Monitoring & Logging

### Console Logs
- `🕐 [TimeoutChecker] Starting timeout check`
- `🔍 [TimeoutChecker] Found X payment timeouts`
- `⏰ [TimeoutChecker] Processing timeout for order: ID`
- `✅ [TimeoutChecker] Status changed to CANCELLED`
- `❌ [TimeoutChecker] Error processing timeout`

### Error Handling
- Batch processing dengan limit 50 orders per run
- Individual error handling untuk setiap order
- Comprehensive error logging
- Graceful failure (tidak menghentikan proses jika satu order gagal)

## Database Queries

### Payment Timeout Query
```javascript
db.collection('orders')
  .where('status', '==', 'payment')
  .where('paymentExpiredAt', '<=', now)
  .limit(50)
```

### Confirmation Timeout Query
```javascript
db.collection('orders')
  .where('status', '==', 'pending')
  .where('confirmationDeadline', '<=', now)
  .limit(50)
```

## Notifications

### Payment Timeout Notification
- **Target**: Client
- **Title**: "⏰ Pembayaran Kedaluwarsa"
- **Message**: "Waktu pembayaran untuk [order title] telah habis. Pesanan dibatalkan."

### Confirmation Timeout Notifications
- **Target**: Client
  - **Title**: "⏰ Pesanan Dibatalkan"
  - **Message**: "Pesanan [order title] dibatalkan karena freelancer tidak merespons dalam 3 jam. Refund akan diproses."

- **Target**: Freelancer
  - **Title**: "⏰ Pesanan Kedaluwarsa"
  - **Message**: "Pesanan [order title] dibatalkan karena tidak dikonfirmasi dalam 3 jam."

## Automatic Refund

Untuk confirmation timeout dengan `paymentStatus === 'paid'`:
1. Call `/api/refund` endpoint
2. Set `refundType: 'auto'`
3. Set `requestedBy: 'system'`
4. Log refund success/failure

## Performance Considerations

- **Batch Size**: 50 orders per run untuk menghindari timeout
- **Frequency**: Setiap 5 menit untuk responsivitas yang baik
- **Error Isolation**: Error pada satu order tidak mempengaruhi yang lain
- **Logging**: Comprehensive logging untuk monitoring dan debugging

## Security

- **Authentication**: X-Cron-Secret header validation
- **Environment**: CRON_SECRET harus dikonfigurasi di production
- **Rate Limiting**: Built-in dengan batch size limit

## Troubleshooting

### Common Issues
1. **CRON_SECRET not configured**: Set environment variable
2. **Unauthorized**: Check X-Cron-Secret header
3. **Firebase connection**: Check Firebase admin configuration
4. **Refund API failure**: Check Tripay configuration

### Debug Commands
```bash
# Test timeout checker
curl -X POST https://your-app.vercel.app/api/cron/timeout-checker \
  -H "X-Cron-Secret: your-secret"

# Health check
curl https://your-app.vercel.app/api/cron/timeout-checker
``` 