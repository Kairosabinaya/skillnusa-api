import { NextResponse } from 'next/server';
import { db } from '../../../../firebase/config';
import { doc, updateDoc, getDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';

export async function POST(request) {
  try {
    console.log('🔔 [Tripay Callback] Received callback request');
    
    // Enhanced request logging
    const headers = Object.fromEntries(request.headers.entries());
    console.log('📋 [Tripay Callback] Headers:', headers);
    
    // Get callback data
    const callbackData = await request.json();
    console.log('📥 [Tripay Callback] Data:', callbackData);
    
    // Validate required fields
    const requiredFields = ['reference', 'merchant_ref', 'status'];
    for (const field of requiredFields) {
      if (!callbackData[field]) {
        console.error(`❌ [Tripay Callback] Missing field: ${field}`);
        return NextResponse.json(
          { success: false, message: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }
    
    const { merchant_ref, status, reference, paid_at, amount_received, payment_method } = callbackData;
    
    console.log('🔍 [Tripay Callback] Processing:', {
      merchant_ref,
      status,
      reference,
      paid_at,
      amount_received,
      payment_method
    });
    
    // Find order by merchant reference
    const ordersRef = collection(db, 'orders');
    const q = query(ordersRef, where('merchantRef', '==', merchant_ref));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      console.error(`❌ [Tripay Callback] Order not found for merchant_ref: ${merchant_ref}`);
      return NextResponse.json(
        { success: false, message: 'Order not found' },
        { status: 404 }
      );
    }
    
    const orderDoc = querySnapshot.docs[0];
    const orderId = orderDoc.id;
    const orderData = orderDoc.data();
    
    console.log('📋 [Tripay Callback] Found order:', {
      orderId,
      currentStatus: orderData.status,
      newStatus: status
    });
    
    // Determine new order status based on Tripay status
    let newOrderStatus = orderData.status;
    let paymentStatus = 'pending';
    
    switch (status.toUpperCase()) {
      case 'PAID':
        newOrderStatus = 'pending'; // Move to pending for freelancer confirmation
        paymentStatus = 'paid';
        break;
      case 'EXPIRED':
        newOrderStatus = 'cancelled';
        paymentStatus = 'expired';
        break;
      case 'FAILED':
        newOrderStatus = 'cancelled';
        paymentStatus = 'failed';
        break;
      case 'REFUND':
        newOrderStatus = 'cancelled';
        paymentStatus = 'refunded';
        break;
      default:
        paymentStatus = 'pending';
        break;
    }
    
    // Prepare update data
    const updateData = {
      paymentStatus,
      tripayStatus: status,
      tripayReference: reference,
      updatedAt: serverTimestamp()
    };
    
    // Add payment completion data if paid
    if (status.toUpperCase() === 'PAID') {
      updateData.status = newOrderStatus;
      updateData.paidAt = paid_at ? new Date(paid_at * 1000) : serverTimestamp();
      
      // Set confirmation deadline (3 hours from payment)
      const confirmationDeadline = new Date();
      confirmationDeadline.setHours(confirmationDeadline.getHours() + 3);
      updateData.confirmationDeadline = confirmationDeadline;
      
      if (amount_received) {
        updateData.amountReceived = amount_received;
      }
      
      if (payment_method) {
        updateData.paymentMethod = payment_method;
      }
      
      // Update timeline
      updateData['timeline.confirmed'] = serverTimestamp();
      
      console.log('💰 [Tripay Callback] Payment confirmed - updating to pending status');
    } else if (['EXPIRED', 'FAILED', 'REFUND'].includes(status.toUpperCase())) {
      updateData.status = newOrderStatus;
      updateData.cancelledAt = serverTimestamp();
      updateData.cancellationReason = `Payment ${status.toLowerCase()}`;
      
      // Update timeline
      updateData['timeline.cancelled'] = serverTimestamp();
      
      console.log(`❌ [Tripay Callback] Payment ${status} - updating to cancelled status`);
    }
    
    // Update order in Firebase
    console.log('🔄 [Tripay Callback] Updating order with data:', updateData);
    const orderRef = doc(db, 'orders', orderId);
    await updateDoc(orderRef, updateData);
    
    console.log('✅ [Tripay Callback] Order updated successfully:', {
      orderId,
      merchantRef: merchant_ref,
      oldStatus: orderData.status,
      newStatus: newOrderStatus,
      paymentStatus
    });
    
    // TODO: Send notification to freelancer if payment is confirmed
    if (status.toUpperCase() === 'PAID') {
      console.log('📧 [Tripay Callback] TODO: Send notification to freelancer');
      // Implement freelancer notification here
    }
    
    return NextResponse.json({
      success: true,
      message: 'Callback processed successfully',
      orderId,
      merchantRef: merchant_ref,
      status: newOrderStatus,
      paymentStatus
    });
    
  } catch (error) {
    console.error('❌ [Tripay Callback] Error processing callback:', error);
    console.error('❌ [Tripay Callback] Error stack:', error.stack);
    
    return NextResponse.json(
      { 
        success: false, 
        message: 'Callback processing failed',
        error: error.message 
      },
      { status: 500 }
    );
  }
}

// Handle other HTTP methods
export async function GET() {
  return NextResponse.json(
    { message: 'Tripay callback endpoint - POST only' },
    { status: 405 }
  );
} 