import { NextResponse } from 'next/server';
import { db } from '../../../firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

// GET - Ambil rekening bank user
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { success: false, message: 'User ID is required' },
        { status: 400 }
      );
    }

    // Get user's bank accounts
    const bankAccountsQuery = await db.collection('bankAccounts')
      .where('userId', '==', userId)
      .where('isActive', '==', true)
      .orderBy('isPrimary', 'desc')
      .orderBy('createdAt', 'desc')
      .get();

    const bankAccounts = [];
    bankAccountsQuery.forEach(doc => {
      bankAccounts.push({
        id: doc.id,
        ...doc.data()
      });
    });

    return NextResponse.json({
      success: true,
      bankAccounts
    });

  } catch (error) {
    console.error('❌ [Bank Account API] Error fetching bank accounts:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Tambah rekening bank baru
export async function POST(request) {
  try {
    const { 
      userId, 
      bankName, 
      accountNumber, 
      accountHolderName, 
      isPrimary = false 
    } = await request.json();

    // Validate required fields
    if (!userId || !bankName || !accountNumber || !accountHolderName) {
      return NextResponse.json(
        { success: false, message: 'All fields are required' },
        { status: 400 }
      );
    }

    // Validate account number (only numbers, 10-20 digits)
    if (!/^\d{10,20}$/.test(accountNumber)) {
      return NextResponse.json(
        { success: false, message: 'Invalid account number format' },
        { status: 400 }
      );
    }

    // Check if account already exists
    const existingAccountQuery = await db.collection('bankAccounts')
      .where('userId', '==', userId)
      .where('accountNumber', '==', accountNumber)
      .where('isActive', '==', true)
      .limit(1)
      .get();

    if (!existingAccountQuery.empty) {
      return NextResponse.json(
        { success: false, message: 'Account number already exists' },
        { status: 400 }
      );
    }

    // If this is set as primary, remove primary status from other accounts
    if (isPrimary) {
      const primaryAccountsQuery = await db.collection('bankAccounts')
        .where('userId', '==', userId)
        .where('isPrimary', '==', true)
        .get();

      const batch = db.batch();
      primaryAccountsQuery.forEach(doc => {
        batch.update(doc.ref, { isPrimary: false });
      });
      await batch.commit();
    }

    // Create new bank account
    const bankAccountData = {
      userId,
      bankName: bankName.toUpperCase(),
      accountNumber,
      accountHolderName: accountHolderName.toUpperCase(),
      isPrimary,
      isActive: true,
      isVerified: false, // Will be verified by admin
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    const bankAccountRef = await db.collection('bankAccounts').add(bankAccountData);

    console.log('✅ [Bank Account API] Bank account created:', bankAccountRef.id);

    return NextResponse.json({
      success: true,
      message: 'Bank account added successfully',
      bankAccountId: bankAccountRef.id
    });

  } catch (error) {
    console.error('❌ [Bank Account API] Error creating bank account:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update rekening bank
export async function PUT(request) {
  try {
    const { 
      bankAccountId, 
      userId,
      bankName, 
      accountNumber, 
      accountHolderName, 
      isPrimary 
    } = await request.json();

    if (!bankAccountId || !userId) {
      return NextResponse.json(
        { success: false, message: 'Bank account ID and user ID are required' },
        { status: 400 }
      );
    }

    // Get existing bank account
    const bankAccountRef = db.collection('bankAccounts').doc(bankAccountId);
    const bankAccountDoc = await bankAccountRef.get();

    if (!bankAccountDoc.exists) {
      return NextResponse.json(
        { success: false, message: 'Bank account not found' },
        { status: 404 }
      );
    }

    const bankAccountData = bankAccountDoc.data();

    // Verify ownership
    if (bankAccountData.userId !== userId) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 403 }
      );
    }

    // If setting as primary, remove primary status from other accounts
    if (isPrimary && !bankAccountData.isPrimary) {
      const primaryAccountsQuery = await db.collection('bankAccounts')
        .where('userId', '==', userId)
        .where('isPrimary', '==', true)
        .get();

      const batch = db.batch();
      primaryAccountsQuery.forEach(doc => {
        batch.update(doc.ref, { isPrimary: false });
      });
      await batch.commit();
    }

    // Update bank account
    const updateData = {
      updatedAt: FieldValue.serverTimestamp()
    };

    if (bankName) updateData.bankName = bankName.toUpperCase();
    if (accountNumber) updateData.accountNumber = accountNumber;
    if (accountHolderName) updateData.accountHolderName = accountHolderName.toUpperCase();
    if (isPrimary !== undefined) updateData.isPrimary = isPrimary;

    await bankAccountRef.update(updateData);

    return NextResponse.json({
      success: true,
      message: 'Bank account updated successfully'
    });

  } catch (error) {
    console.error('❌ [Bank Account API] Error updating bank account:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Hapus rekening bank (soft delete)
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const bankAccountId = searchParams.get('bankAccountId');
    const userId = searchParams.get('userId');

    if (!bankAccountId || !userId) {
      return NextResponse.json(
        { success: false, message: 'Bank account ID and user ID are required' },
        { status: 400 }
      );
    }

    // Get existing bank account
    const bankAccountRef = db.collection('bankAccounts').doc(bankAccountId);
    const bankAccountDoc = await bankAccountRef.get();

    if (!bankAccountDoc.exists) {
      return NextResponse.json(
        { success: false, message: 'Bank account not found' },
        { status: 404 }
      );
    }

    const bankAccountData = bankAccountDoc.data();

    // Verify ownership
    if (bankAccountData.userId !== userId) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Soft delete
    await bankAccountRef.update({
      isActive: false,
      deletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    return NextResponse.json({
      success: true,
      message: 'Bank account deleted successfully'
    });

  } catch (error) {
    console.error('❌ [Bank Account API] Error deleting bank account:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
} 