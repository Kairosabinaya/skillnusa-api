/**
 * Test script for timeout checker
 * This script can be used to manually test the timeout checker functionality
 */

const testTimeoutChecker = async () => {
  try {
    console.log('🧪 Testing Timeout Checker...');
    
    // Get the base URL
    const baseUrl = process.env.VERCEL_URL || 'http://localhost:3000';
    const cronSecret = process.env.CRON_SECRET || 'test-secret-key';
    
    console.log(`📡 Calling timeout checker at: ${baseUrl}/api/cron/timeout-checker`);
    
    const response = await fetch(`${baseUrl}/api/cron/timeout-checker`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Cron-Secret': cronSecret
      }
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Timeout checker response:', result);
      
      if (result.processedCount > 0) {
        console.log(`🎯 Processed ${result.processedCount} timeout orders`);
        console.log(`   - Payment timeouts: ${result.results.paymentTimeouts}`);
        console.log(`   - Confirmation timeouts: ${result.results.confirmationTimeouts}`);
      } else {
        console.log('ℹ️ No timeout orders found');
      }
      
      if (result.results.errors.length > 0) {
        console.log('⚠️ Errors encountered:');
        result.results.errors.forEach(error => console.log(`   - ${error}`));
      }
    } else {
      const errorText = await response.text();
      console.error('❌ Timeout checker failed:', response.status, errorText);
    }
    
  } catch (error) {
    console.error('❌ Error testing timeout checker:', error);
  }
};

// Run the test if this script is executed directly
if (require.main === module) {
  testTimeoutChecker();
}

module.exports = { testTimeoutChecker }; 