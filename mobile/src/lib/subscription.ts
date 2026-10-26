import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { apiRequest } from './api';

export const BOB_PRODUCT_ID = 'bob_monthly';
export const BOB_MONTHLY_PRICE = '$4.99';
export const BOB_AI_BUDGET = '$4.00';
const TOKEN_KEY = '@bob_access_token';

export type BobAccess = {
  accessToken: string;
  budgetUsd: string;
  spentUsd: string;
  remainingUsd: string;
};

function allowance(data: { budget_usd?: string; spent_usd?: string; remaining_usd?: string }, token: string): BobAccess {
  return {
    accessToken: token,
    budgetUsd: data.budget_usd || '4.00',
    spentUsd: data.spent_usd || '0.00',
    remainingUsd: data.remaining_usd || '4.00',
  };
}

export async function clearStoredBobAccess() {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function readStoredBobAccess(): Promise<BobAccess | null> {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  try {
    const data = await apiRequest<{ budget_usd?: string; spent_usd?: string; remaining_usd?: string }>(
      '/api/v2/bob/access',
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return allowance(data, token);
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 401 || status === 402) await clearStoredBobAccess();
    return null;
  }
}

async function activateOnServer(platform: 'ios' | 'android', purchaseToken: string) {
  const data = await apiRequest<{ access_token: string; budget_usd?: string; spent_usd?: string; remaining_usd?: string }>(
    '/api/v2/bob/subscription',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, product_id: BOB_PRODUCT_ID, purchase_token: purchaseToken }),
    },
  );
  if (!data.access_token) throw new Error('The subscription could not be confirmed.');
  await AsyncStorage.setItem(TOKEN_KEY, data.access_token);
  return allowance(data, data.access_token);
}

type StorePurchase = { purchaseToken?: string | null; productId?: string };

async function confirmPurchase(platform: 'ios' | 'android', purchase: StorePurchase, finish: (purchase: StorePurchase) => Promise<unknown>) {
  if (!purchase.purchaseToken) throw new Error('The store did not return a receipt.');
  const access = await activateOnServer(platform, purchase.purchaseToken);
  await finish(purchase);
  return access;
}

export async function purchaseBob(): Promise<BobAccess> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    throw new Error('Subscriptions are available in the iOS and Android apps.');
  }
  const platform = Platform.OS;
  const iap = await import('expo-iap');
  await iap.initConnection();
  const products = await iap.fetchProducts({ skus: [BOB_PRODUCT_ID], type: 'subs' });
  const product = (products || []).find((item) => item.id === BOB_PRODUCT_ID);
  const offers = product && 'subscriptionOffers' in product ? product.subscriptionOffers : undefined;
  const offerToken = offers?.find((offer) => offer.offerTokenAndroid)?.offerTokenAndroid;
  if (platform === 'android' && !offerToken) {
    throw new Error('The monthly plan is not available from the store yet.');
  }
  const purchase = await new Promise<StorePurchase>((resolve, reject) => {
    const updated = iap.purchaseUpdatedListener((event) => {
      if (event.productId !== BOB_PRODUCT_ID) return;
      updated.remove();
      failed.remove();
      resolve(event);
    });
    const failed = iap.purchaseErrorListener((error) => {
      updated.remove();
      failed.remove();
      reject(new Error(error.message || 'The subscription could not be completed.'));
    });
    iap.requestPurchase({
      request: {
        apple: { sku: BOB_PRODUCT_ID },
        google: {
          skus: [BOB_PRODUCT_ID],
          subscriptionOffers: offerToken ? [{ sku: BOB_PRODUCT_ID, offerToken }] : [],
        },
      },
      type: 'subs',
    }).catch((error) => {
      updated.remove();
      failed.remove();
      reject(error instanceof Error ? error : new Error('The subscription could not be completed.'));
    });
  });
  return confirmPurchase(platform, purchase, (item) => iap.finishTransaction({ purchase: item as never, isConsumable: false }));
}

export async function restoreBob(): Promise<BobAccess> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    throw new Error('Subscriptions are available in the iOS and Android apps.');
  }
  const platform = Platform.OS;
  const iap = await import('expo-iap');
  await iap.initConnection();
  const purchases = await iap.getAvailablePurchases();
  const purchase = purchases.find((item) => item.productId === BOB_PRODUCT_ID && item.purchaseToken);
  if (!purchase?.purchaseToken) throw new Error('No active Bob subscription was found for this store account.');
  return confirmPurchase(platform, purchase, (item) => iap.finishTransaction({ purchase: item as never, isConsumable: false }));
}
