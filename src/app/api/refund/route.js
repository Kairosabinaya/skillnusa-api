import { NextResponse } from 'next/server';
import { db } from '../../../firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(request) {
  try {
    console.log('💰 [Refund API] Processing refund request');
    
    const { orderId, reason, refundType = 'auto', requestedBy } = await request.json();
    
    // Validate required fields
    if (!orderId) {
      return NextResponse.json(
        { success: false, message: 'Order ID is required' },
        { status: 400 }
      );
    }

    // Get order data
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();
    
    if (!orderDoc.exists) {
      return NextResponse.json(
        { success: false, message: 'Order not found' },
        { status: 404 }
      );
    }

    const orderData = orderDoc.data();
    
    // Validate order can be refunded
    const validationResult = validateRefundEligibility(orderData);
    if (!validationResult.eligible) {
      return NextResponse.json(
        { success: false, message: validationResult.reason },
        { status: 400 }
      );
    }

    // Check if refund already exists
    const existingRefund = await checkExistingRefund(orderId);
    if (existingRefund) {
      return NextResponse.json(
        { success: false, message: 'Refund already processed for this order' },
        { status: 400 }
      );
    }

    // Calculate refund amount
    const refundAmount = calculateRefundAmount(orderData);
    
    // Create refund record
    const refundData = {
      orderId,
      merchantRef: orderData.merchantRef,
      tripayReference: orderData.tripayReference,
      refundAmount,
      originalAmount: orderData.totalAmount || orderData.price || 0,
      reason: reason || 'Automatic refund due to timeout',
      refundType, // 'auto' or 'manual'
      requestedBy: requestedBy || 'system',
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    // Add refund to database
    const refundRef = await db.collection('refunds').add(refundData);
    const refundId = refundRef.id;

    console.log('💰 [Refund API] Refund record created:', refundId);

    // Process refund with Tripay (if payment was made)
    let tripayRefundResult = null;
    if (orderData.paymentStatus === 'paid' && orderData.tripayReference) {
      try {
        tripayRefundResult = await processTripayRefund(orderData, refundAmount, refundId);
        console.log('💰 [Refund API] Tripay refund result:', tripayRefundResult);
      } catch (tripayError) {
        console.error('❌ [Refund API] Tripay refund failed:', tripayError);
        
        // Update refund status to failed
        await refundRef.update({
          status: 'failed',
          errorMessage: tripayError.message,
          updatedAt: FieldValue.serverTimestamp()
        });

        return NextResponse.json(
          { 
            success: false, 
            message: 'Refund processing failed',
            error: tripayError.message 
          },
          { status: 500 }
        );
      }
    }

    // Update order with refund information
    await orderRef.update({
      refundStatus: 'pending',
      refundId,
      refundAmount,
      refundInitiatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    // Create notifications
    await createRefundNotifications(orderData, refundAmount, reason);

    console.log('✅ [Refund API] Refund processed successfully:', refundId);

    return NextResponse.json({
      success: true,
      message: 'Refund processed successfully',
      refundId,
      refundAmount,
      tripayResult: tripayRefundResult
    });

  } catch (error) {
    console.error('❌ [Refund API] Error processing refund:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Internal server error',
        error: error.message 
      },
      { status: 500 }
    );
  }
}

// Validate if order is eligible for refund
function validateRefundEligibility(orderData) {
  // Cannot refund if already cancelled
  if (orderData.status === 'cancelled') {
    return { eligible: false, reason: 'Order is already cancelled' };
  }

  // Cannot refund if already completed
  if (orderData.status === 'completed') {
    return { eligible: false, reason: 'Cannot refund completed orders' };
  }

  // Cannot refund if payment not made
  if (orderData.paymentStatus !== 'paid') {
    return { eligible: false, reason: 'No payment to refund' };
  }

  // Check refund time limit (e.g., 30 days)
  const paymentDate = orderData.paidAt?.toDate() || orderData.createdAt?.toDate();
  if (paymentDate) {
    const daysSincePayment = (new Date() - paymentDate) / (1000 * 60 * 60 * 24);
    if (daysSincePayment > 30) {
      return { eligible: false, reason: 'Refund period has expired (30 days)' };
    }
  }

  return { eligible: true };
}

// Check if refund already exists for this order
async function checkExistingRefund(orderId) {
  const refundQuery = await db.collection('refunds')
    .where('orderId', '==', orderId)
    .where('status', 'in', ['pending', 'completed'])
    .limit(1)
    .get();
  
  return !refundQuery.empty;
}

// Calculate refund amount (full refund for now)
function calculateRefundAmount(orderData) {
  return orderData.totalAmount || orderData.price || 0;
}

// Process refund with Tripay
async function processTripayRefund(orderData, refundAmount, refundId) {
  // Note: Tripay doesn't have direct refund API
  // This would typically involve:
  // 1. Manual refund through Tripay dashboard, OR
  // 2. Using bank transfer to customer, OR
  // 3. Credit to customer's SkillNusa wallet

  console.log('💰 [Refund API] Processing Tripay refund:', {
    merchantRef: orderData.merchantRef,
    tripayReference: orderData.tripayReference,
    refundAmount
  });

  // For now, we'll mark as manual refund required
  // In production, implement actual refund mechanism
  return {
    method: 'manual_processing_required',
    merchantRef: orderData.merchantRef,
    tripayReference: orderData.tripayReference,
    refundAmount,
    note: 'Manual refund processing required through Tripay dashboard or bank transfer'
  };
}

// Create notifications for refund
async function createRefundNotifications(orderData, refundAmount, reason) {
  const notifications = [];

  // Notify client
  notifications.push({
    userId: orderData.clientId,
    type: 'refund',
    title: '💰 Refund Diproses',
    message: `Refund sebesar ${formatCurrency(refundAmount)} untuk pesanan "${orderData.title}" sedang diproses. ${reason}`,
    orderId: orderData.id || 'unknown',
    createdAt: FieldValue.serverTimestamp(),
    read: false
  });

  // Notify freelancer (if applicable)
  if (orderData.freelancerId) {
    notifications.push({
      userId: orderData.freelancerId,
      type: 'refund',
      title: '💰 Pesanan Dibatalkan',
      message: `Pesanan "${orderData.title}" dibatalkan dan refund diproses untuk client. ${reason}`,
      orderId: orderData.id || 'unknown',
      createdAt: FieldValue.serverTimestamp(),
      read: false
    });
  }

  // Create all notifications
  for (const notification of notifications) {
    try {
      await db.collection('notifications').add(notification);
    } catch (error) {
      console.error('Error creating refund notification:', error);
    }
  }
}

// Helper function to format currency
function formatCurrency(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount);
}

// GET method for refund status check
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');
    const refundId = searchParams.get('refundId');

    if (!orderId && !refundId) {
      return NextResponse.json(
        { success: false, message: 'Order ID or Refund ID is required' },
        { status: 400 }
      );
    }

    let refundQuery;
    if (refundId) {
      const refundDoc = await db.collection('refunds').doc(refundId).get();
      if (!refundDoc.exists) {
        return NextResponse.json(
          { success: false, message: 'Refund not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({
        success: true,
        refund: { id: refundDoc.id, ...refundDoc.data() }
      });
    } else {
      refundQuery = await db.collection('refunds')
        .where('orderId', '==', orderId)
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();
      
      if (refundQuery.empty) {
        return NextResponse.json(
          { success: false, message: 'No refund found for this order' },
          { status: 404 }
        );
      }

      const refundDoc = refundQuery.docs[0];
      return NextResponse.json({
        success: true,
        refund: { id: refundDoc.id, ...refundDoc.data() }
      });
    }

  } catch (error) {
    console.error('❌ [Refund API] Error checking refund status:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
} 