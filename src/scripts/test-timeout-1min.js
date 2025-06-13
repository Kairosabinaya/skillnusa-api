/**
 * Test script for 1-minute timeout testing
 * This script helps test the timeout functionality with 1-minute intervals
 */

const testTimeoutWithInstructions = async () => {
  console.log('🧪 SkillNusa Timeout Testing (1 Minute Mode)');
  console.log('='.repeat(50));
  console.log('');
  
  console.log('📋 TESTING INSTRUCTIONS:');
  console.log('');
  console.log('1️⃣ PAYMENT TIMEOUT TEST:');
  console.log('   - Create a new order (status will be "payment")');
  console.log('   - DO NOT pay the order');
  console.log('   - Wait 1 minute');
  console.log('   - Order should automatically change to "cancelled"');
  console.log('');
  
  console.log('2️⃣ CONFIRMATION TIMEOUT TEST:');
  console.log('   - Create a new order and pay it (status becomes "pending")');
  console.log('   - DO NOT accept/reject as freelancer');
  console.log('   - Wait 1 minute');
  console.log('   - Order should automatically change to "cancelled"');
  console.log('   - Refund should be processed automatically');
  console.log('');
  
  console.log('⏰ CURRENT TIMEOUT SETTINGS:');
  console.log('   - Payment timeout: 1 minute (was 60 minutes)');
  console.log('   - Confirmation timeout: 1 minute (was 3 hours)');
  console.log('   - Cron job runs every 5 minutes');
  console.log('');
  
  console.log('🔄 MANUAL TIMEOUT CHECK:');
  console.log('   Running timeout checker now...');
  console.log('');
  
  try {
    // Get the base URL
    const baseUrl = process.env.VERCEL_URL || 'http://localhost:3000';
    const cronSecret = process.env.CRON_SECRET || 'test-secret-key';
    
    console.log(`📡 Calling: ${baseUrl}/api/cron/timeout-checker`);
    
    const response = await fetch(`${baseUrl}/api/cron/timeout-checker`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Cron-Secret': cronSecret
      }
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Timeout checker response:');
      console.log(`   - Processed: ${result.processedCount} orders`);
      console.log(`   - Payment timeouts: ${result.results.paymentTimeouts}`);
      console.log(`   - Confirmation timeouts: ${result.results.confirmationTimeouts}`);
      
      if (result.results.errors.length > 0) {
        console.log('⚠️ Errors:');
        result.results.errors.forEach(error => console.log(`   - ${error}`));
      }
      
      if (result.processedCount === 0) {
        console.log('ℹ️ No timeout orders found at this time');
      }
    } else {
      const errorText = await response.text();
      console.error('❌ Timeout checker failed:', response.status, errorText);
    }
    
  } catch (error) {
    console.error('❌ Error testing timeout checker:', error);
  }
  
  console.log('');
  console.log('📝 NOTES:');
  console.log('   - Remember to change timeouts back to production values after testing');
  console.log('   - Payment timeout: 60 minutes');
  console.log('   - Confirmation timeout: 3 hours');
  console.log('');
  console.log('🔧 TO REVERT TO PRODUCTION:');
  console.log('   1. Change paymentExpiredAt: 60 * 60 * 1000 (60 minutes)');
  console.log('   2. Change confirmationDeadline: +3 hours');
  console.log('   3. Update all timeout messages');
  console.log('   4. Redeploy the application');
  console.log('');
};

// Run the test
testTimeoutWithInstructions();

module.exports = { testTimeoutWithInstructions }; 