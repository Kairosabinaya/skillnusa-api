import { NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin SDK
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID, // PLACEHOLDER
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL, // PLACEHOLDER
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'), // PLACEHOLDER
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL, // PLACEHOLDER
  });
}

const db = getFirestore();

export async function POST(request) {
  try {
    // Validate request secret
    const callbackSecret = request.headers.get('X-Callback-Secret');
    const expectedSecret = process.env.NEXTJS_API_SECRET; // PLACEHOLDER
    
    if (!callbackSecret || callbackSecret !== expectedSecret) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { tripay_callback, validated, timestamp } = body;

    // Validate payload structure
    if (!tripay_callback || !validated) {
      return NextResponse.json(
        { error: 'Invalid payload structure' },
        { status: 400 }
      );
    }

    const {
      callback_merchant_ref,
      callback_payment_status,
      callback_paid_at,
      callback_amount,
      callback_tripay_reference
    } = tripay_callback;

    // Extract order ID from merchant reference (SKILLNUSA-{timestamp})
    const orderTimestamp = callback_merchant_ref.replace('SKILLNUSA-', '');
    
    // Find order by merchant reference or timestamp
    // We'll need to store merchant_ref in orders when creating payment
    const ordersRef = db.collection('orders');
    const querySnapshot = await ordersRef
      .where('merchantRef', '==', callback_merchant_ref)
      .limit(1)
      .get();

    if (querySnapshot.empty) {
      console.error('Order not found for merchant_ref:', callback_merchant_ref);
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    const orderDoc = querySnapshot.docs[0];
    const orderId = orderDoc.id;
    const orderData = orderDoc.data();

    // Determine new order status based on payment status
    let newStatus = orderData.status;
    let paymentStatus = 'pending';

    switch (callback_payment_status) {
      case 'PAID':
        newStatus = 'pending'; // Move to pending after payment
        paymentStatus = 'paid';
        break;
      case 'EXPIRED':
      case 'FAILED':
      case 'CANCELLED':
        newStatus = 'cancelled';
        paymentStatus = 'failed';
        break;
      case 'UNPAID':
        // Keep current status
        paymentStatus = 'pending';
        break;
      default:
        console.warn('Unknown payment status:', callback_payment_status);
        break;
    }

    // Update order in Firebase
    const updateData = {
      paymentStatus,
      tripayReference: callback_tripay_reference,
      paidAt: callback_paid_at ? new Date(callback_paid_at * 1000) : null,
      paidAmount: callback_amount,
      updatedAt: new Date(),
    };

    // Only update status if it changes
    if (newStatus !== orderData.status) {
      updateData.status = newStatus;
      
      // Update timeline based on new status
      if (newStatus === 'pending') {
        updateData['timeline.paidAt'] = new Date();
        // Set 3-hour timeout for freelancer confirmation
        const confirmationDeadline = new Date();
        confirmationDeadline.setHours(confirmationDeadline.getHours() + 3);
        updateData.confirmationDeadline = confirmationDeadline;
      } else if (newStatus === 'cancelled') {
        updateData['timeline.cancelledAt'] = new Date();
        updateData.cancellationReason = `Payment ${callback_payment_status.toLowerCase()}`;
      }
    }

    await orderDoc.ref.update(updateData);

    // Create notification for user
    await createNotification(orderData.clientId, {
      type: 'payment',
      title: getNotificationTitle(callback_payment_status),
      message: getNotificationMessage(callback_payment_status, orderData.title),
      orderId: orderId,
      createdAt: new Date()
    });

    // If payment successful, also notify freelancer
    if (callback_payment_status === 'PAID') {
      await createNotification(orderData.freelancerId, {
        type: 'order',
        title: 'Pesanan Baru Masuk!',
        message: `Anda mendapat pesanan baru: ${orderData.title}. Konfirmasi dalam 3 jam.`,
        orderId: orderId,
        createdAt: new Date()
      });
    }

    console.log(`Order ${orderId} updated successfully. Status: ${newStatus}, Payment: ${paymentStatus}`);

    return NextResponse.json({
      success: true,
      message: 'Callback processed successfully',
      orderId: orderId,
      newStatus: newStatus,
      paymentStatus: paymentStatus
    });

  } catch (error) {
    console.error('Error processing Tripay callback:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
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
      isRead: false
    });
  } catch (error) {
    console.error('Error creating notification:', error);
  }
}

// Helper functions for notification messages
function getNotificationTitle(paymentStatus) {
  switch (paymentStatus) {
    case 'PAID':
      return '✅ Pembayaran Berhasil';
    case 'EXPIRED':
      return '⏰ Pembayaran Kedaluwarsa';
    case 'FAILED':
      return '❌ Pembayaran Gagal';
    case 'CANCELLED':
      return '🚫 Pembayaran Dibatalkan';
    default:
      return '💳 Update Pembayaran';
  }
}

function getNotificationMessage(paymentStatus, orderTitle) {
  switch (paymentStatus) {
    case 'PAID':
      return `Pembayaran untuk "${orderTitle}" berhasil. Menunggu konfirmasi freelancer.`;
    case 'EXPIRED':
      return `Waktu pembayaran untuk "${orderTitle}" telah habis. Pesanan dibatalkan.`;
    case 'FAILED':
      return `Pembayaran untuk "${orderTitle}" gagal diproses.`;
    case 'CANCELLED':
      return `Pembayaran untuk "${orderTitle}" dibatalkan.`;
    default:
      return `Status pembayaran untuk "${orderTitle}" diperbarui.`;
  }
} 