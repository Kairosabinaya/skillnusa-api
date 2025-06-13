/**
 * Simple Order Checker - CommonJS version
 * Manual instructions for checking timeout orders
 */

console.log('🧪 SkillNusa Timeout Order Checker');
console.log('='.repeat(50));
console.log('');

const now = new Date();
console.log('⏰ Current time:', now.toISOString());
console.log('⏰ Current time (local):', now.toLocaleString('id-ID'));
console.log('');

console.log('📋 MANUAL TIMEOUT CHECK INSTRUCTIONS:');
console.log('='.repeat(50));
console.log('');

console.log('🔍 Step 1: Open Firebase Console');
console.log('   URL: https://console.firebase.google.com');
console.log('   Project: skillnusa-6b3ad (or your project name)');
console.log('');

console.log('🔍 Step 2: Go to Firestore Database');
console.log('   Click "Firestore Database" in the left sidebar');
console.log('   Click on "orders" collection');
console.log('');

console.log('🔍 Step 3: Look for Expired Orders');
console.log('');

console.log('   💳 PAYMENT TIMEOUTS:');
console.log('   - Find orders with status = "payment"');
console.log('   - Check if paymentExpiredAt < current time');
console.log('   - Example: paymentExpiredAt = 2025-01-13T21:55:00.000Z');
console.log('   - Current time = ' + now.toISOString());
console.log('   - If paymentExpiredAt is BEFORE current time = EXPIRED');
console.log('');

console.log('   ⏰ CONFIRMATION TIMEOUTS:');
console.log('   - Find orders with status = "pending"');
console.log('   - Check if confirmationDeadline < current time');
console.log('   - If confirmationDeadline is BEFORE current time = EXPIRED');
console.log('');

console.log('🔧 Step 4: Update Expired Orders');
console.log('');

console.log('   For PAYMENT TIMEOUTS, update these fields:');
console.log('   ✏️ status: "cancelled"');
console.log('   ✏️ paymentStatus: "expired"');
console.log('   ✏️ cancellationReason: "Payment timeout (1 minute - TESTING)"');
console.log('   ✏️ cancelledAt: ' + now.toISOString());
console.log('   ✏️ timeline.cancelled: ' + now.toISOString());
console.log('');

console.log('   For CONFIRMATION TIMEOUTS, update these fields:');
console.log('   ✏️ status: "cancelled"');
console.log('   ✏️ cancellationReason: "Freelancer confirmation timeout (1 minute - TESTING)"');
console.log('   ✏️ cancelledAt: ' + now.toISOString());
console.log('   ✏️ refundStatus: "pending"');
console.log('   ✏️ timeline.cancelled: ' + now.toISOString());
console.log('');

console.log('📊 Step 5: Check Results');
console.log('   - Refresh the frontend application');
console.log('   - Order should now show status "cancelled"');
console.log('   - Countdown should disappear');
console.log('');

console.log('🚨 COMMON ISSUES:');
console.log('');
console.log('   ❌ Order still shows "payment" status:');
console.log('      → Check if paymentExpiredAt is actually expired');
console.log('      → Make sure you updated the correct order ID');
console.log('      → Refresh the browser cache');
console.log('');
console.log('   ❌ Countdown not showing for freelancer:');
console.log('      → Check if confirmationDeadline field exists');
console.log('      → Make sure order status is "pending"');
console.log('      → Check if payment was actually confirmed');
console.log('');

console.log('🔄 TESTING FLOW:');
console.log('');
console.log('   1. Create new order → status: "payment"');
console.log('   2. Wait 1 minute (or manually expire paymentExpiredAt)');
console.log('   3. Manually update status to "cancelled" in Firebase');
console.log('   4. Check frontend - order should show as cancelled');
console.log('');
console.log('   For confirmation timeout:');
console.log('   1. Create order and pay → status: "pending"');
console.log('   2. Wait 1 minute (or manually expire confirmationDeadline)');
console.log('   3. Manually update status to "cancelled" in Firebase');
console.log('   4. Check frontend - order should show as cancelled');
console.log('');

console.log('✅ Manual check completed!');
console.log('');
console.log('💡 TIP: In production, the cron job will do this automatically every 5 minutes.');
console.log('💡 For testing, you need to do it manually or run the server locally.');
console.log(''); 