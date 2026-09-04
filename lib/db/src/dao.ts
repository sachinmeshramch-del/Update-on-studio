import { db } from './index';
import { Signal, InsertSignal, PushSubscription } from './schema/index.js';
import { collection, query, where, getDocs, getDoc, addDoc, updateDoc, doc, deleteDoc, orderBy, limit, writeBatch } from 'firebase/firestore';

export async function insertPushSubscription(endpoint: string, p256dh: string, auth: string): Promise<void> {
  const q = query(collection(db, 'push_subscriptions'), where('endpoint', '==', endpoint));
  const snap = await getDocs(q);
  if (snap.empty) {
    await addDoc(collection(db, 'push_subscriptions'), {
      endpoint, p256dh, auth, createdAt: new Date()
    });
  } else {
    await updateDoc(snap.docs[0].ref, { p256dh, auth });
  }
}

export async function getPushSubscriptions(): Promise<PushSubscription[]> {
  const snap = await getDocs(collection(db, 'push_subscriptions'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as PushSubscription));
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  const q = query(collection(db, 'push_subscriptions'), where('endpoint', '==', endpoint));
  const snap = await getDocs(q);
  for (const d of snap.docs) {
    await deleteDoc(d.ref);
  }
}

export async function getLatestSignal(): Promise<Signal | null> {
  const q = query(collection(db, 'signals'), orderBy('createdAt', 'desc'), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  const data = d.data();
  return { ...data, id: d.id, createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt), closedAt: data.closedAt?.toDate?.() || (data.closedAt ? new Date(data.closedAt) : null) } as Signal;
}

export async function getRunningTrades(): Promise<Signal[]> {
  const q = query(collection(db, 'signals'), where('tradeStatus', '==', 'RUNNING'));
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const data = d.data();
    return { ...data, id: d.id, createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt), closedAt: data.closedAt?.toDate?.() || (data.closedAt ? new Date(data.closedAt) : null) } as Signal;
  });
}

export async function updateTradeStatus(id: string, tradeStatus: string, closedPrice: number, pnlPoints: number): Promise<void> {
  await updateDoc(doc(db, 'signals', id), {
    tradeStatus, closedPrice, pnlPoints, closedAt: new Date()
  });
}

export async function getClosedTrades(limitCount: number): Promise<Signal[]> {
  const q = query(collection(db, 'signals'), where('tradeStatus', 'in', ['TARGET_HIT', 'STOP_HIT']), orderBy('createdAt', 'desc'), limit(limitCount));
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const data = d.data();
    return { ...data, id: d.id, createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt), closedAt: data.closedAt?.toDate?.() || (data.closedAt ? new Date(data.closedAt) : null) } as Signal;
  });
}

export async function insertSignal(signalData: InsertSignal): Promise<void> {
  await addDoc(collection(db, 'signals'), {
    ...signalData,
    createdAt: new Date(),
  });
}

export async function getRecentSignals(limitCount: number): Promise<Signal[]> {
  const q = query(collection(db, 'signals'), orderBy('createdAt', 'desc'), limit(limitCount));
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const data = d.data();
    return { ...data, id: d.id, createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt), closedAt: data.closedAt?.toDate?.() || (data.closedAt ? new Date(data.closedAt) : null) } as Signal;
  });
}

export async function deleteSignalById(id: string): Promise<boolean> {
  try {
    await deleteDoc(doc(db, 'signals', id));
    return true;
  } catch (e) {
    return false;
  }
}

export async function clearAllHistory(): Promise<number> {
  const snap = await getDocs(collection(db, 'signals'));
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  return snap.size;
}
export async function updateTradeStopLoss(id: string, stopLoss: number): Promise<void> {
  await updateDoc(doc(db, 'signals', id), {
    stopLoss
  });
}

import { SystemSettings } from './schema/index';
import { setDoc } from 'firebase/firestore';

export async function getSystemSettings(): Promise<SystemSettings> {
  const q = query(collection(db, 'settings'), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) {
    const defaultSettings: SystemSettings = {
      tradingMode: 'DEMO',
      demoAccountId: '',
      realAccountId: process.env.META_ACCOUNT_ID || '',
      autoTradingDemoEnabled: false,
      autoTradingRealEnabled: false,
      autoTradingEnabled: false,
      metaApiSymbol: process.env.META_API_SYMBOL || 'XAUUSD'
    };
    return defaultSettings;
  }
  const d = snap.docs[0];
  const settings = { id: d.id, ...d.data() } as SystemSettings;
  // Strictly enforce real account auto trading to ALWAYS be false
  settings.autoTradingRealEnabled = false;
  return settings;
}

export async function updateSystemSettings(settings: Partial<SystemSettings>): Promise<SystemSettings> {
  const current = await getSystemSettings();
  const id = current.id || 'general';
  
  const updated = { ...current, ...settings };
  // Strictly enforce real account auto trading to ALWAYS be false
  updated.autoTradingRealEnabled = false;
  
  delete updated.id; // don't write id into document
  
  await setDoc(doc(db, 'settings', id), updated, { merge: true });
  return { ...updated, id };
}

export async function getSignalById(id: string): Promise<Signal | null> {
  
  const snap = await getDoc(doc(db, 'signals', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Signal;
}
