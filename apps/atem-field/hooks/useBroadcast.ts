'use client';

import { useEffect, useRef, useCallback } from 'react';
import { BroadcastMessage, createBroadcastReceiver } from '@/lib/broadcast';

export function useBroadcastReceiver(onMessage: (msg: BroadcastMessage) => void) {
  const receiverRef = useRef<ReturnType<typeof createBroadcastReceiver> | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    const receiver = createBroadcastReceiver((msg) => {
      onMessageRef.current(msg);
    });
    receiverRef.current = receiver;

    // Send PONG on PING, and announce presence
    receiver.send({ type: 'PONG' });

    return () => {
      receiver.close();
    };
  }, []);

  const send = useCallback((msg: BroadcastMessage) => {
    receiverRef.current?.send(msg);
  }, []);

  return { send };
}
