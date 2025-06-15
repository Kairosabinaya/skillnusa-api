import { NextResponse } from 'next/server';
import { db } from '../../../../firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

// Production timeout settings
const PAYMENT_TIMEOUT_MINUTES = process.env.NODE_ENV === 'production' ? 60 : 5; // 60 min prod, 5 min dev
const CONFIRMATION_TIMEOUT_HOURS = 3; // Always 3 hours for confirmation

export async function POST(request) {
  try {
    console.log('⏰ [Timeout Checker] Starting timeout check cron job');
    console.log('⏰ [Timeout Checker] Environment:', process.env.NODE_ENV);
    console.log('⏰ [Timeout Checker] Timeout settings:', {
      paymentTimeoutMinutes: PAYMENT_TIMEOUT_MINUTES,
      confirmationTimeoutHours: CONFIRMATION_TIMEOUT_HOURS
    });

    // Verify cron authorization
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET || 'default-dev-secret';
    
    if (authHeader !== `Bearer ${cronSecret}`) {
      console.error('❌ [Timeout Checker] Unauthorized cron request');
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const now = new Date();
    let totalUpdated = 0;

    // Calculate cutoff times
    const paymentCutoff = new Date(now.getTime() - (PAYMENT_TIMEOUT_MINUTES * 60 * 1000));
    const confirmationCutoff = new Date(now.getTime() - (CONFIRMATION_TIMEOUT_HOURS * 60 * 60 * 1000));

    console.log('⏰ [Timeout Checker] Cutoff times:', {
      now: now.toISOString(),
      paymentCutoff: paymentCutoff.toISOString(),
      confirmationCutoff: confirmationCutoff.toISOString()
    });

    // 1. Handle payment timeout orders
    console.log('🔍 [Timeout Checker] Checking for payment timeout orders...');
    
    try {
      const paymentTimeoutQuery = db.collection('orders')
        .where('status', '==', 'payment')
        .where('paymentExpiredAt', '<=', now)
        .limit(100); // Process in batches to avoid timeout

      const paymentTimeoutSnapshot = await paymentTimeoutQuery.get();
      
      if (!paymentTimeoutSnapshot.empty) {
        console.log(`⏰ [Timeout Checker] Found ${paymentTimeoutSnapshot.size} payment timeout orders`);
        
        const batch = db.batch();
        let paymentTimeoutCount = 0;
        
        paymentTimeoutSnapshot.forEach((doc) => {
          const orderData = doc.data();
          
          console.log('⏰ [Timeout Checker] Processing payment timeout order:', {
            orderId: doc.id,
            orderNumber: orderData.orderNumber,
            paymentExpiredAt: orderData.paymentExpiredAt?.toDate?.()?.toISOString() || orderData.paymentExpiredAt,
            currentStatus: orderData.status
          });
          
          batch.update(doc.ref, {
            status: 'cancelled',
            paymentStatus: 'expired',
            cancellationReason: 'Payment timeout',
            cancelledAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            'timeline.cancelled': FieldValue.serverTimestamp(),
            autoProcessed: true,
            processedBy: 'timeout-checker',
            processedAt: FieldValue.serverTimestamp()
          });
          
          paymentTimeoutCount++;
        });
        
        if (paymentTimeoutCount > 0) {
          await batch.commit();
          console.log(`✅ [Timeout Checker] Successfully cancelled ${paymentTimeoutCount} payment timeout orders`);
          totalUpdated += paymentTimeoutCount;
        }
      } else {
        console.log('✅ [Timeout Checker] No payment timeout orders found');
      }
    } catch (paymentError) {
      console.error('❌ [Timeout Checker] Error processing payment timeouts:', paymentError);
      // Continue with other checks even if this fails
    }

    // 2. Handle freelancer confirmation timeout orders
    console.log('🔍 [Timeout Checker] Checking for confirmation timeout orders...');
    
    try {
      const confirmationTimeoutQuery = db.collection('orders')
        .where('status', '==', 'pending')
        .where('confirmationDeadline', '<=', now)
        .limit(100); // Process in batches

      const confirmationTimeoutSnapshot = await confirmationTimeoutQuery.get();
      
      if (!confirmationTimeoutSnapshot.empty) {
        console.log(`⏰ [Timeout Checker] Found ${confirmationTimeoutSnapshot.size} confirmation timeout orders`);
        
        const batch = db.batch();
        let confirmationTimeoutCount = 0;
        
        confirmationTimeoutSnapshot.forEach((doc) => {
          const orderData = doc.data();
          
          console.log('⏰ [Timeout Checker] Processing confirmation timeout order:', {
            orderId: doc.id,
            orderNumber: orderData.orderNumber,
            confirmationDeadline: orderData.confirmationDeadline?.toDate?.()?.toISOString() || orderData.confirmationDeadline,
            currentStatus: orderData.status,
            freelancerId: orderData.freelancerId
          });
          
          batch.update(doc.ref, {
            status: 'cancelled',
            cancellationReason: 'Freelancer confirmation timeout',
            cancelledAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            'timeline.cancelled': FieldValue.serverTimestamp(),
            refundStatus: 'pending', // Mark for refund since payment was confirmed
            autoProcessed: true,
            processedBy: 'timeout-checker',
            processedAt: FieldValue.serverTimestamp()
          });
          
          confirmationTimeoutCount++;
        });
        
        if (confirmationTimeoutCount > 0) {
          await batch.commit();
          console.log(`✅ [Timeout Checker] Successfully cancelled ${confirmationTimeoutCount} confirmation timeout orders`);
          totalUpdated += confirmationTimeoutCount;
        }
      } else {
        console.log('✅ [Timeout Checker] No confirmation timeout orders found');
      }
    } catch (confirmationError) {
      console.error('❌ [Timeout Checker] Error processing confirmation timeouts:', confirmationError);
      // Continue with other checks
    }

    // 3. Handle work deadline timeout orders (Optional - for future use)
    console.log('🔍 [Timeout Checker] Checking for work deadline timeout orders...');
    
    try {
      const workDeadlineQuery = db.collection('orders')
        .where('status', 'in', ['confirmed', 'in_progress'])
        .where('workDeadline', '<=', now)
        .limit(50); // Smaller batch for work deadline

      const workDeadlineSnapshot = await workDeadlineQuery.get();
      
      if (!workDeadlineSnapshot.empty) {
        console.log(`⏰ [Timeout Checker] Found ${workDeadlineSnapshot.size} work deadline timeout orders`);
        
        const batch = db.batch();
        let workDeadlineCount = 0;
        
        workDeadlineSnapshot.forEach((doc) => {
          const orderData = doc.data();
          
          console.log('⏰ [Timeout Checker] Processing work deadline timeout order:', {
            orderId: doc.id,
            orderNumber: orderData.orderNumber,
            workDeadline: orderData.workDeadline?.toDate?.()?.toISOString() || orderData.workDeadline,
            currentStatus: orderData.status,
            freelancerId: orderData.freelancerId
          });
          
          // Mark as deadline exceeded but don't auto-cancel
          // Let client decide whether to cancel or extend
          batch.update(doc.ref, {
            deadlineExceeded: true,
            deadlineExceededAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            autoProcessed: true,
            processedBy: 'timeout-checker',
            processedAt: FieldValue.serverTimestamp()
          });
          
          workDeadlineCount++;
        });
        
        if (workDeadlineCount > 0) {
          await batch.commit();
          console.log(`✅ [Timeout Checker] Successfully marked ${workDeadlineCount} work deadline exceeded orders`);
          totalUpdated += workDeadlineCount;
        }
      } else {
        console.log('✅ [Timeout Checker] No work deadline timeout orders found');
      }
    } catch (workDeadlineError) {
      console.error('❌ [Timeout Checker] Error processing work deadline timeouts:', workDeadlineError);
      // Continue execution
    }

    // 4. Cleanup old cancelled orders (Optional - monthly cleanup)
    const isFirstDayOfMonth = now.getDate() === 1;
    if (isFirstDayOfMonth) {
      console.log('🧹 [Timeout Checker] Running monthly cleanup of old cancelled orders...');
      
      try {
        const oneMonthAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        
        const oldCancelledQuery = db.collection('orders')
          .where('status', '==', 'cancelled')
          .where('cancelledAt', '<=', oneMonthAgo)
          .limit(100);

        const oldCancelledSnapshot = await oldCancelledQuery.get();
        
        if (!oldCancelledSnapshot.empty) {
          console.log(`🧹 [Timeout Checker] Found ${oldCancelledSnapshot.size} old cancelled orders to cleanup`);
          
          const batch = db.batch();
          
          oldCancelledSnapshot.forEach((doc) => {
            // Add cleanup marker instead of deleting
            batch.update(doc.ref, {
              cleanedUp: true,
              cleanedUpAt: FieldValue.serverTimestamp()
            });
          });
          
          await batch.commit();
          console.log(`✅ [Timeout Checker] Successfully marked ${oldCancelledSnapshot.size} old orders for cleanup`);
        } else {
          console.log('✅ [Timeout Checker] No old cancelled orders to cleanup');
        }
      } catch (cleanupError) {
        console.error('❌ [Timeout Checker] Error during monthly cleanup:', cleanupError);
      }
    }

    // 5. Create notifications for deadline warnings (Optional)
    console.log('🔔 [Timeout Checker] Checking for deadline warnings...');
    
    try {
      // Warn 1 hour before payment timeout
      const paymentWarningCutoff = new Date(now.getTime() + (60 * 60 * 1000)); // 1 hour from now
      
      const paymentWarningQuery = db.collection('orders')
        .where('status', '==', 'payment')
        .where('paymentExpiredAt', '<=', paymentWarningCutoff)
        .where('paymentExpiredAt', '>', now)
        .limit(50);

      const paymentWarningSnapshot = await paymentWarningQuery.get();
      
      if (!paymentWarningSnapshot.empty) {
        console.log(`🔔 [Timeout Checker] Found ${paymentWarningSnapshot.size} orders nearing payment timeout`);
        
        // Could add notification creation here
        // For now, just log the warning
        paymentWarningSnapshot.forEach((doc) => {
          const orderData = doc.data();
          console.log('⚠️ [Timeout Checker] Payment timeout warning for order:', {
            orderId: doc.id,
            orderNumber: orderData.orderNumber,
            expiresAt: orderData.paymentExpiredAt?.toDate?.()?.toISOString() || orderData.paymentExpiredAt
          });
        });
      }
    } catch (warningError) {
      console.error('❌ [Timeout Checker] Error checking deadline warnings:', warningError);
    }

    const executionTime = Date.now() - now.getTime();
    
    console.log('✅ [Timeout Checker] Cron job completed successfully:', {
      totalOrdersUpdated: totalUpdated,
      executionTimeMs: executionTime,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV
    });

    return NextResponse.json({
      success: true,
      message: 'Timeout checker completed successfully',
      data: {
        totalOrdersUpdated: totalUpdated,
        executionTimeMs: executionTime,
        timestamp: new Date().toISOString(),
        settings: {
          paymentTimeoutMinutes: PAYMENT_TIMEOUT_MINUTES,
          confirmationTimeoutHours: CONFIRMATION_TIMEOUT_HOURS,
          environment: process.env.NODE_ENV
        }
      }
    });

  } catch (error) {
    console.error('❌ [Timeout Checker] Critical error in cron job:', error);
    console.error('❌ [Timeout Checker] Error stack:', error.stack);

    return NextResponse.json({
      success: false,
      error: {
        message: 'Timeout checker failed',
        details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
        timestamp: new Date().toISOString()
      }
    }, { status: 500 });
  }
}

// Handle GET requests (for health check)
export async function GET() {
  return NextResponse.json({
    message: 'Timeout Checker Cron Job Endpoint',
    status: 'active',
    settings: {
      paymentTimeoutMinutes: PAYMENT_TIMEOUT_MINUTES,
      confirmationTimeoutHours: CONFIRMATION_TIMEOUT_HOURS,
      environment: process.env.NODE_ENV
    },
    lastCheck: new Date().toISOString()
  });
} 