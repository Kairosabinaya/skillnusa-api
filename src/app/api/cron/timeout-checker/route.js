import { NextResponse } from 'next/server';
import { db } from '../../../../firebase/admin';

export async function POST(request) {
  try {
    // Validate cron secret
    const cronSecret = request.headers.get('X-Cron-Secret');
    const expectedSecret = process.env.CRON_SECRET;
    
    if (!expectedSecret) {
      console.error('CRON_SECRET not configured');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }
    
    if (!cronSecret || cronSecret !== expectedSecret) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const now = new Date();
    let processedCount = 0;
    const results = {
      paymentTimeouts: 0,
      confirmationTimeouts: 0,
      errors: []
    };

    console.log('🕐 [TimeoutChecker] Starting timeout check at:', now.toISOString());

    // 1. Check for payment timeouts (status: 'payment' and expired)
    try {
      const paymentTimeoutQuery = await db.collection('orders')
        .where('status', '==', 'payment')
        .where('paymentExpiredAt', '<=', now)
        .limit(50) // Limit batch size for performance
        .get();

      console.log(`🔍 [TimeoutChecker] Found ${paymentTimeoutQuery.size} payment timeouts`);

      for (const doc of paymentTimeoutQuery.docs) {
        try {
          const orderId = doc.id;
          const orderData = doc.data();
          
          console.log(`⏰ [TimeoutChecker] Processing payment timeout for order: ${orderId}`);
          
          await doc.ref.update({
            status: 'cancelled',
            paymentStatus: 'expired',
            cancellationReason: 'Payment timeout (1 minute - TESTING)',
            cancelledAt: now,
            updatedAt: now,
            'timeline.cancelled': now
          });

          // Create notification for client
          await createNotification(orderData.clientId, {
            type: 'payment',
            title: '⏰ Pembayaran Kedaluwarsa',
            message: `Waktu pembayaran untuk "${orderData.title}" telah habis (1 menit - TESTING). Pesanan dibatalkan.`,
            orderId: orderId,
            createdAt: now
          });

          results.paymentTimeouts++;
          console.log(`✅ [TimeoutChecker] Payment timeout processed for order: ${orderId} - Status changed to CANCELLED`);
        } catch (error) {
          console.error(`❌ [TimeoutChecker] Error processing payment timeout for order ${doc.id}:`, error);
          results.errors.push(`Payment timeout error for ${doc.id}: ${error.message}`);
        }
      }
    } catch (error) {
      console.error('❌ [TimeoutChecker] Error checking payment timeouts:', error);
      results.errors.push(`Payment timeout check error: ${error.message}`);
    }

    // 2. Check for freelancer confirmation timeouts (status: 'pending' and confirmationDeadline passed)
    try {
      const confirmationTimeoutQuery = await db.collection('orders')
        .where('status', '==', 'pending')
        .where('confirmationDeadline', '<=', now)
        .limit(50) // Limit batch size for performance
        .get();

      console.log(`🔍 [TimeoutChecker] Found ${confirmationTimeoutQuery.size} confirmation timeouts`);

      for (const doc of confirmationTimeoutQuery.docs) {
        try {
          const orderId = doc.id;
          const orderData = doc.data();
          
          console.log(`⏰ [TimeoutChecker] Processing confirmation timeout for order: ${orderId}`);
          
          await doc.ref.update({
            status: 'cancelled',
            cancellationReason: 'Freelancer confirmation timeout (1 minute - TESTING)',
            cancelledAt: now,
            updatedAt: now,
            refundStatus: 'pending',
            refundAmount: orderData.totalAmount || orderData.price || 0,
            refundInitiatedAt: now,
            'timeline.cancelled': now,
            'timeline.refundInitiatedAt': now
          });

          // Trigger automatic refund for paid orders
          if (orderData.paymentStatus === 'paid') {
            try {
              console.log(`💰 [TimeoutChecker] Triggering auto refund for order: ${orderId}`);
              
              // Call refund API
              const refundResponse = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/refund`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  orderId: orderId,
                  reason: 'Freelancer confirmation timeout (1 minute - TESTING)',
                  refundType: 'auto',
                  requestedBy: 'system'
                })
              });

              if (refundResponse.ok) {
                const refundResult = await refundResponse.json();
                console.log(`✅ [TimeoutChecker] Auto refund initiated for order: ${orderId}`, refundResult);
              } else {
                console.error(`❌ [TimeoutChecker] Auto refund failed for order: ${orderId}`, await refundResponse.text());
              }
            } catch (refundError) {
              console.error(`❌ [TimeoutChecker] Error triggering auto refund for order ${orderId}:`, refundError);
              // Don't fail the timeout process if refund fails
            }
          }

          // Create notification for client
          await createNotification(orderData.clientId, {
            type: 'order',
            title: '⏰ Pesanan Dibatalkan',
            message: `Pesanan "${orderData.title}" dibatalkan karena freelancer tidak merespons dalam 1 menit (TESTING). Refund akan diproses.`,
            orderId: orderId,
            createdAt: now
          });

          // Create notification for freelancer
          await createNotification(orderData.freelancerId, {
            type: 'order',
            title: '⏰ Pesanan Kedaluwarsa',
            message: `Pesanan "${orderData.title}" dibatalkan karena tidak dikonfirmasi dalam 1 menit (TESTING).`,
            orderId: orderId,
            createdAt: now
          });

          results.confirmationTimeouts++;
          console.log(`✅ [TimeoutChecker] Confirmation timeout processed for order: ${orderId}`);
        } catch (error) {
          console.error(`❌ [TimeoutChecker] Error processing confirmation timeout for order ${doc.id}:`, error);
          results.errors.push(`Confirmation timeout error for ${doc.id}: ${error.message}`);
        }
      }
    } catch (error) {
      console.error('❌ [TimeoutChecker] Error checking confirmation timeouts:', error);
      results.errors.push(`Confirmation timeout check error: ${error.message}`);
    }

    processedCount = results.paymentTimeouts + results.confirmationTimeouts;
    
    console.log('✅ [TimeoutChecker] Timeout check completed:', {
      processedCount,
      paymentTimeouts: results.paymentTimeouts,
      confirmationTimeouts: results.confirmationTimeouts,
      errors: results.errors.length
    });

    return NextResponse.json({
      success: true,
      message: 'Timeout check completed',
      processedCount,
      results,
      timestamp: now.toISOString()
    });

  } catch (error) {
    console.error('❌ [TimeoutChecker] Critical error in timeout checker:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        details: error.message,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// Helper function to create notifications
async function createNotification(userId, notificationData) {
  try {
    await db.collection('notifications').add({
      userId,
      ...notificationData,
      read: false,
      createdAt: notificationData.createdAt || new Date()
    });
  } catch (error) {
    console.error('Error creating notification:', error);
    // Don't throw error to prevent breaking the main timeout process
  }
}

// GET method for health check
export async function GET() {
  return NextResponse.json({
    service: 'Timeout Checker',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
} 