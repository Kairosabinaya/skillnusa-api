/**
 * Simple Timeout Test Script
 * Uses the existing Firebase Admin configuration
 */

// Import the existing Firebase Admin setup
import { db } from './src/firebase/admin.js';

async function testTimeoutChecker() {
  console.log('🧪 Simple Timeout Checker Test');
  console.log('='.repeat(40));
  
  const now = new Date();
  console.log('⏰ Current time:', now.toISOString());
  
  try {
    // 1. Check for payment timeouts
    console.log('\n1️⃣ Checking Payment Timeouts...');
    const paymentTimeoutQuery = await db.collection('orders')
      .where('status', '==', 'payment')
      .where('paymentExpiredAt', '<=', now)
      .limit(10)
      .get();
    
    console.log(`   Found ${paymentTimeoutQuery.size} payment timeouts`);
    
    for (const doc of paymentTimeoutQuery.docs) {
      const orderData = doc.data();
      console.log(`   - Order ${doc.id}: ${orderData.title}`);
      console.log(`     Expired at: ${orderData.paymentExpiredAt?.toDate?.()?.toISOString() || orderData.paymentExpiredAt}`);
      
      // Update to cancelled
      await doc.ref.update({
        status: 'cancelled',
        paymentStatus: 'expired',
        cancellationReason: 'Payment timeout (1 minute - TESTING)',
        cancelledAt: now,
        updatedAt: now,
        'timeline.cancelled': now
      });
      
      console.log(`   ✅ Updated to cancelled`);
    }
    
    // 2. Check for confirmation timeouts
    console.log('\n2️⃣ Checking Confirmation Timeouts...');
    const confirmationTimeoutQuery = await db.collection('orders')
      .where('status', '==', 'pending')
      .where('confirmationDeadline', '<=', now)
      .limit(10)
      .get();
    
    console.log(`   Found ${confirmationTimeoutQuery.size} confirmation timeouts`);
    
    for (const doc of confirmationTimeoutQuery.docs) {
      const orderData = doc.data();
      console.log(`   - Order ${doc.id}: ${orderData.title}`);
      console.log(`     Deadline: ${orderData.confirmationDeadline?.toDate?.()?.toISOString() || orderData.confirmationDeadline}`);
      
      // Update to cancelled
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
      
      console.log(`   ✅ Updated to cancelled with refund pending`);
    }
    
    // 3. Show current orders status
    console.log('\n3️⃣ Current Orders Status:');
    const allOrdersQuery = await db.collection('orders')
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();
    
    allOrdersQuery.forEach(doc => {
      const orderData = doc.data();
      console.log(`   - ${doc.id.slice(-8)}: ${orderData.status} | ${orderData.title}`);
      if (orderData.paymentExpiredAt) {
        const expiry = orderData.paymentExpiredAt?.toDate?.() || new Date(orderData.paymentExpiredAt);
        const expired = expiry <= now;
        console.log(`     Payment expires: ${expiry.toISOString()} ${expired ? '❌ EXPIRED' : '✅ Valid'}`);
      }
      if (orderData.confirmationDeadline) {
        const deadline = orderData.confirmationDeadline?.toDate?.() || new Date(orderData.confirmationDeadline);
        const expired = deadline <= now;
        console.log(`     Confirmation deadline: ${deadline.toISOString()} ${expired ? '❌ EXPIRED' : '✅ Valid'}`);
      }
    });
    
    console.log('\n✅ Timeout check completed!');
    
  } catch (error) {
    console.error('❌ Error during timeout check:', error);
  }
}

// Run the test
testTimeoutChecker().then(() => {
  console.log('\n🏁 Test finished');
  process.exit(0);
}).catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
}); 